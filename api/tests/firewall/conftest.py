"""Shared firewall test helpers: capture every engine.record_event call, run the agent offline."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime

import pytest

import engine
from agents.victim.planner import GulliblePlanner
from agents.victim.runner import run_agent
from agents.victim.tools import OUTBOX
from firewall.integrations import StaticEntityState
from schemas.kairos import Event


@pytest.fixture(autouse=True)
def events(monkeypatch):
    """Capture every record_event call. With a db (the in-memory fake) Daylen's real engine runs;
    without one we build the Event locally so no test ever reaches the real Supabase."""
    captured = []
    real = engine.record_event

    def spy(*, db=None, **kw):
        if db is not None:
            ev = real(db=db, **kw)
        else:
            risk = max(0, min(100, int(kw["risk"])))
            ev = Event(
                id=str(uuid.uuid4()),
                created_at=datetime.now(UTC),
                level=engine.score_to_level(risk),
                **{**kw, "risk": risk, "mitre": kw.get("mitre") or []},
            )
        captured.append(ev)
        return ev

    monkeypatch.setattr(engine, "record_event", spy)
    return captured


@pytest.fixture(autouse=True)
def _clean_outbox():
    OUTBOX.clear()
    yield
    OUTBOX.clear()


@pytest.fixture
def run():
    """run(request, **kw) -> AgentOutcome, using the deterministic gullible planner."""

    def _run(user_request, **kw):
        kw.setdefault("planner", GulliblePlanner())
        kw.setdefault("state", StaticEntityState())
        return asyncio.run(run_agent(user_request, **kw))

    return _run
