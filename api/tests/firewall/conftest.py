"""Shared firewall test helpers: capture every engine.record_event call, run the agent offline."""

from __future__ import annotations

import asyncio

import pytest

import engine
from agents.victim.planner import GulliblePlanner
from agents.victim.runner import run_agent
from agents.victim.tools import OUTBOX
from firewall.integrations import StaticEntityState


@pytest.fixture
def events(monkeypatch):
    captured = []
    real = engine.record_event

    def spy(**kw):
        ev = real(**kw)
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
