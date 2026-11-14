"""Scripted Red Team chain tests (checklist step 8). OWNER: Miles (P2). No network, no database."""

from __future__ import annotations

import asyncio

import engine
from redteam import chain, firewall_bridge, seed
from sensors import comms_guard


def run(stage="full_chain", mode="protected", db=None):
    return asyncio.run(chain.run(stage, mode, db=db))


class _Rows:
    def __init__(self, data):
        self.data = data


class _LockedDb:
    """entity_state stand-in where the given accounts are locked."""

    def __init__(self, locked):
        self.locked, self._entity = set(locked), None

    def table(self, _name):
        return self

    def select(self, *_a):
        return self

    def eq(self, _col, value):
        self._entity = value
        return self

    def limit(self, _n):
        return self

    def execute(self):
        return _Rows([{"locked": self._entity in self.locked, "sessions_revoked_at": None}])


def _one_incident(events) -> bool:
    """The engine's link rule: same actor, or one event's target is the next one's actor; same source."""
    linked = {0}
    for _ in events:
        for i, a in enumerate(events):
            for j, b in enumerate(events):
                if i in linked and j not in linked and a.source == b.source:
                    if a.actor == b.actor or a.target == b.actor or b.target == a.actor:
                        linked.add(j)
    return len(linked) == len(events)


def test_full_chain_is_three_medium_events_that_make_one_critical_incident():
    result = run()
    assert [(e.sensor, e.risk, e.level) for e in result.events] == [
        ("login_guard", 45, "medium"),
        ("comms_guard", 50, "medium"),
        ("agent_firewall", 55, "medium"),
    ]
    assert all(e.source == "scripted" for e in result.events)
    assert _one_incident(result.events)
    sensors = {e.sensor for e in result.events}
    risk = engine.incident_risk([e.risk for e in result.events], len(sensors))
    assert risk == 85 and engine.score_to_level(risk) == "critical"
    assert result.outcome == "blocked"


def test_events_link_through_the_taken_over_account():
    one, two, three = run().events
    assert (one.actor, one.target) == (chain.BOT_ACTOR, "j.smith")
    assert (two.actor, two.target) == ("j.smith", "e.cruz")
    assert (three.actor, three.target) == ("j.smith", "finance_agent")
    assert three.verdict == "blocked" and "Nothing left the company" in three.reason


def test_mitre_ids_cover_attack_and_atlas():
    ids = [m.technique_id for e in run().events for m in e.mitre]
    assert ids == ["T1110.004", "T1078", "T1534", "T1656", "T1657", "AML.T0051.001", "AML.T0053", "AML.T0057"]


def test_the_chain_is_the_same_every_run():
    first, second = run(), run()
    assert first.log_lines == second.log_lines
    assert [(e.risk, e.reason) for e in first.events] == [(e.risk, e.reason) for e in second.events]


def test_single_stages_run_on_their_own():
    assert run("credential_stuffing").outcome == "account_compromised"
    assert run("impersonation").outcome == "message_delivered"
    assert run("prompt_injection").outcome == "blocked"
    assert [len(run(s).events) for s in ("credential_stuffing", "impersonation", "prompt_injection")] == [1, 1, 1]


def test_unprotected_mode_leaks_and_records_nothing():
    result = run(mode="unprotected")
    assert result.outcome == "leaked" and result.events == []
    assert any("exfiltration: SUCCESS" in line for line in result.log_lines)


def test_locked_account_stops_the_chain_at_stage_one():
    result = run(db=_LockedDb({"j.smith"}))
    assert result.outcome == "account_locked"
    assert any("account locked" in line for line in result.log_lines)
    assert [e.sensor for e in result.events] == ["login_guard"]
    assert result.events[0].verdict == "blocked"
    assert not any("stage 2" in line for line in result.log_lines)


def test_log_shows_only_the_attackers_view():
    text = "\n".join(run().log_lines).lower()
    assert "exfiltration attempt: access denied" in text
    for defender_word in ("risk", "kairos", "incident", "score", "flagged", "mitre", "login guard", "firewall"):
        assert defender_word not in text
    assert not seed.contains_vault_code(text)
    payroll = seed.read_file(seed.PAYROLL_PATH)
    assert not any(row.split(",")[-1] in text for row in payroll.strip().splitlines()[1:])


def test_everything_stays_inside_the_sandbox():
    result = run()
    for event in result.events:
        for name in (event.actor, event.target):
            assert name == chain.BOT_ACTOR or name in seed.all_entities()
    assert "cisco.com" not in "\n".join(result.log_lines)
    assert chain.BOT_ACTOR.startswith("bot:203.0.113.")  # reserved documentation range


def test_stage_three_uses_the_scripted_stand_in_until_the_firewall_is_ready():
    outcome = asyncio.run(firewall_bridge.run_stage3("protected"))
    assert firewall_bridge.FIREWALL_READY is False and outcome.via == "scripted"
    assert outcome.blocked and outcome.event.risk == firewall_bridge.BLOCKED_HIJACK_RISK == 55


def test_wire_request_is_recalled_once_the_engine_reports_a_critical_incident(monkeypatch):
    """Stand-in for Daylen's engine: after each event, if 3 listeners are linked, report Critical."""
    comms_guard.reset_messages()
    real_record, seen = engine.record_event, []

    def record_and_correlate(**kwargs):
        event = real_record(**kwargs)
        seen.append(event)
        if len({e.sensor for e in seen}) == 3:
            risk = engine.incident_risk([e.risk for e in seen], 3)
            comms_guard.on_incident_escalated(list(seen), engine.score_to_level(risk))
        return event

    monkeypatch.setattr(engine, "record_event", record_and_correlate)
    result = run()
    assert result.log_lines[-2] == "wire request to e.cruz@cisco.example: RECALLED (no longer in the inbox)"
    assert [e.action for e in result.events][-1] == "message_recalled"
    assert comms_guard.get_message(result.message_id).held
    # The recall does not change the incident score: still 55 + 30 = 85.
    assert engine.incident_risk([e.risk for e in result.events], 3) == 85
    comms_guard.reset_messages()


def test_without_an_escalation_nothing_is_recalled():
    comms_guard.reset_messages()
    result = run()
    assert not any("RECALLED" in line for line in result.log_lines)
    assert len(result.events) == 3 and comms_guard.held_messages() == []
    comms_guard.reset_messages()


def test_endpoint_runs_the_chain(client, token_factory):
    headers = {"Authorization": f"Bearer {token_factory()}"}
    r = client.post("/redteam/run", json={"stage": "full_chain"}, headers=headers)
    assert r.status_code == 200 and r.json()["outcome"] == "blocked"
    assert "exfiltration attempt: ACCESS DENIED" in r.json()["log_lines"]
    r = client.post("/redteam/run", json={"stage": "full_chain", "target": "unprotected"}, headers=headers)
    assert r.json()["outcome"] == "leaked"
    assert client.post("/redteam/run", json={"stage": "full_chain"}).status_code == 401
    bad = client.post("/redteam/run", json={"stage": "rm -rf", "target": "cisco.com"}, headers=headers)
    assert bad.status_code == 422
