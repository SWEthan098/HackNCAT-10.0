import asyncio

import pytest

import detectors
import engine
from firewall.core import Firewall
from firewall.integrations import EntityStateReader, StaticEntityState
from schemas.kairos import Detection

SEND = "Email the budget to m.reyes@cisco.example"


def _sends(out):
    return [d for d in out.firewall.ctx.decisions if d.tool == "send_email"]


def test_frozen_agent_cannot_act(run, events):
    out = run(SEND, state=StaticEntityState(frozen={"finance_agent"}))
    assert out.run.executed == [] and out.run.sent == []
    assert all(d.verdict == "blocked" and d.layer == "containment" for d in out.firewall.ctx.decisions)
    assert "frozen" in out.firewall.ctx.decisions[0].reason


def test_kill_switch_row_freezes_every_agent(run):
    out = run(SEND, state=StaticEntityState(frozen={"*"}))
    assert out.run.executed == []


def test_locked_actor_is_blocked(run):
    out = run(SEND, state=StaticEntityState(locked={"j.smith"}))
    assert out.run.executed == [] and "locked" in out.firewall.ctx.decisions[0].reason


def test_unknown_state_holds_sends_but_allows_reads(run):
    out = run(SEND, state=StaticEntityState(unknown=True))
    reads = [d for d in out.firewall.ctx.decisions if d.tool == "read_file"]
    assert reads and reads[0].verdict == "allowed"
    assert _sends(out)[0].verdict == "flagged" and out.run.sent == []
    assert out.firewall.ctx.held_layers == ["containment"]


def test_flagged_injection_holds_a_sensitive_action_for_approval(run, monkeypatch, events):
    async def flag_files(text):
        return Detection(flagged="budget" in text.lower(), confidence=0.9, technique="override", explanation="x")

    monkeypatch.setattr(detectors, "scan_injection", flag_files)
    approvals = []
    monkeypatch.setattr(engine, "create_approval", lambda **kw: approvals.append(kw) or {"id": "ap-1"}, raising=False)
    real = engine.record_event

    def with_incident(**kw):
        ev = real(**kw)
        return ev.model_copy(update={"incident_id": "inc-1"})

    monkeypatch.setattr(engine, "record_event", with_incident)
    out = run(SEND)
    send = _sends(out)[0]
    assert send.verdict == "flagged" and send.layer == "injection_scan"
    assert "Held for human approval" in send.reason
    assert out.run.sent == []
    assert out.firewall.ctx.approvals == ["ap-1"]
    assert approvals[0]["incident_id"] == "inc-1"
    assert "m.reyes" not in approvals[0]["summary"]  # template text only, no attacker-controlled values


def test_failed_intent_check_holds(run, monkeypatch):
    async def boom(*_a):
        raise TimeoutError

    monkeypatch.setattr(detectors, "check_intent", boom)
    out = run(SEND)
    assert _sends(out)[0].verdict == "flagged" and _sends(out)[0].layer == "intent_check"


def test_firewall_never_writes_entity_state():
    class SpyDB:
        writes = []

        def table(self, name):
            spy = self

            class Q:
                def select(self, *a, **k):
                    return self

                def eq(self, *a):
                    return self

                def execute(self):
                    return type("R", (), {"data": []})()

                def __getattr__(self, op):  # insert/update/upsert/delete
                    spy.writes.append((name, op))
                    raise AssertionError("firewall tried to write")

            return Q()

    fw = Firewall.for_task(
        agent="finance_agent",
        user_request=SEND,
        actor="j.smith",
        target="finance_agent",
        source="scripted",
        state=EntityStateReader(SpyDB()),
    )
    asyncio.run(fw.before_tool("send_email", {"to": "m.reyes@cisco.example", "subject": "s", "body": "b"}))
    assert SpyDB.writes == []


@pytest.mark.parametrize("frozen", [True, False])
def test_db_reader_reads_rows(frozen):
    class DB:
        def table(self, name):
            assert name == "entity_state"

            class Q:
                def select(self, *a, **k):
                    return self

                def eq(self, col, val):
                    self.val = val
                    return self

                def execute(self):
                    rows = [{"entity": "finance_agent", "locked": False, "frozen": frozen}]
                    return type("R", (), {"data": [r for r in rows if r["entity"] == self.val]})()

            return Q()

    assert EntityStateReader(DB()).agent_frozen("finance_agent") is frozen
