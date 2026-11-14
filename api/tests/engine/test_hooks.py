"""The engine's callbacks into Comms Guard (Miles). OWNER: Daylen (P3)."""

from __future__ import annotations

import sys
import types

import pytest

from engine import decide_approval, is_frozen, is_locked, reset_demo
from schemas.kairos import Event

from .helpers import full_chain, rows, stage1, stage2


@pytest.fixture
def comms_guard(monkeypatch):
    """A stand-in for sensors.comms_guard that records how the engine called it."""
    module = types.ModuleType("sensors.comms_guard")
    module.calls = []
    module.on_incident_escalated = lambda events, level: module.calls.append(("escalated", events, level))
    module.reset_messages = lambda: module.calls.append(("reset",))
    monkeypatch.setitem(sys.modules, "sensors.comms_guard", module)
    return module


def test_comms_guard_hears_every_level_change_with_the_incidents_events(fake_db, comms_guard):
    events = full_chain(fake_db)
    calls = [c for c in comms_guard.calls if c[0] == "escalated"]
    assert [c[2] for c in calls] == ["high", "critical"]  # opened at High, then rose to Critical
    last_events = calls[-1][1]
    assert all(isinstance(e, Event) for e in last_events)
    assert [e.id for e in last_events] == [e.id for e in events]


def test_no_call_when_the_level_stays_the_same(fake_db, comms_guard):
    stage1(fake_db)
    assert comms_guard.calls == []  # no incident yet
    stage2(fake_db)
    stage2(fake_db)  # same listeners, same level
    assert [c[2] for c in comms_guard.calls] == ["high"]


def test_reset_tells_comms_guard(fake_db, comms_guard):
    full_chain(fake_db)
    reset_demo(fake_db, by="user:redteam")
    assert ("reset",) in comms_guard.calls


def test_reset_reloads_the_seed_with_everything_unlocked(fake_db):
    """Miles's real seed: after a reset every sandbox entity is back, and none is locked or frozen."""
    from redteam.seed import all_entities

    full_chain(fake_db)
    decide_approval(fake_db, rows(fake_db, "approvals")[0]["id"], user_id="approver-1", approve=True)
    assert is_locked(fake_db, "j.smith") and is_frozen(fake_db, "finance_agent")

    reset_demo(fake_db, by="user:redteam")
    state = rows(fake_db, "entity_state")
    assert {r["entity"] for r in state} == set(all_entities())
    assert not any(r["locked"] or r["frozen"] or r["sessions_revoked_at"] for r in state)
    assert not is_locked(fake_db, "j.smith") and not is_frozen(fake_db, "finance_agent")
    assert rows(fake_db, "incidents") == [] and rows(fake_db, "events") == []


def test_a_broken_or_missing_hook_never_stops_the_engine(fake_db, comms_guard, monkeypatch):
    def boom(*_a):
        raise RuntimeError("comms guard is broken")

    comms_guard.on_incident_escalated = boom
    comms_guard.reset_messages = boom
    full_chain(fake_db)
    assert [(i["risk"], i["status"]) for i in rows(fake_db, "incidents")] == [(85, "awaiting_approval")]
    reset_demo(fake_db, by="user:redteam")
    assert rows(fake_db, "incidents") == []

    monkeypatch.setitem(sys.modules, "sensors.comms_guard", None)  # module not there at all
    full_chain(fake_db)
    assert len(rows(fake_db, "incidents")) == 1


def test_async_hooks_are_supported(fake_db, comms_guard):
    seen = []

    async def on_incident_escalated(events, level):
        seen.append(level)

    comms_guard.on_incident_escalated = on_incident_escalated
    full_chain(fake_db)
    assert seen == ["high", "critical"]
