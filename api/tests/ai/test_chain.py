"""Scripted Red Team chain tests (checklist step 8). OWNER: Miles (P2). No network, no database."""

from __future__ import annotations

import asyncio
import uuid

import engine
from detectors.login import FEATURE_KEYS
from redteam import chain, firewall_bridge, seed
from sensors import comms_guard
from sensors.events import saved


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
    assert ids == ["T1110.004", "T1078", "T1534", "T1684.001", "T1657", "AML.T0051.001", "AML.T0053", "AML.T0086"]


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


def test_stage_three_uses_the_stand_in_offline_and_the_real_firewall_with_a_database(fake_db):
    offline = asyncio.run(firewall_bridge.run_stage3("protected"))
    assert offline.via == "scripted" and offline.blocked
    assert offline.event.risk == firewall_bridge.BLOCKED_HIJACK_RISK == 55

    real = asyncio.run(firewall_bridge.run_stage3("protected", fake_db))
    assert real.via == "firewall" and real.blocked and not real.leaked
    assert real.event.risk == 55 and real.event.verdict == "blocked"
    assert {(e.actor, e.target, e.source) for e in real.events} == {("j.smith", "finance_agent", "scripted")}
    saved_rows = [r for r in fake_db.tables["events"].rows if r["sensor"] == "agent_firewall"]
    assert len(saved_rows) == len(real.events)  # the firewall saved its own events

    leak = asyncio.run(firewall_bridge.run_stage3("unprotected", fake_db))
    assert leak.leaked and not leak.blocked


def test_stage_three_finishes_with_the_scripted_agent_when_the_model_is_offline(fake_db, monkeypatch):
    from agents.victim import runner
    from agents.victim.planner import AgentOffline

    real_run, calls = runner.run_agent, []

    async def flaky(task, **kw):
        calls.append("planner" in kw)
        if "planner" not in kw:
            raise AgentOffline("timeout")
        return await real_run(task, **kw)

    monkeypatch.setattr(runner, "run_agent", flaky)
    outcome = asyncio.run(firewall_bridge.run_stage3("protected", fake_db))
    assert calls == [False, True] and outcome.blocked
    assert outcome.via == "firewall (scripted agent: model offline)"


def test_attacker_log_names_the_email_that_actually_runs(fake_db):
    seed_email, real_email = firewall_bridge.planted(), firewall_bridge.planted(fake_db)
    assert seed_email.id == seed.POISONED_EMAIL_ID and seed_email.exfil_address == seed.EXFIL_ADDRESS
    assert real_email.id != seed_email.id and real_email.to == "j.smith@cisco.example"
    assert not real_email.exfil_address.endswith("@cisco.example") and real_email.path.startswith("/shared/finance/")
    log = "\n".join(run("prompt_injection", db=fake_db).log_lines)
    assert real_email.id in log and real_email.exfil_address in log and seed.EXFIL_ADDRESS not in log


def test_wire_request_is_recalled_once_the_engine_reports_a_critical_incident(monkeypatch, fake_db):
    """Stand-in for Daylen's engine: after each event, if 3 listeners are linked, report Critical."""
    comms_guard.reset_messages()
    real_record, seen = engine.record_event, []

    def record_and_correlate(**kwargs):
        event = real_record(**kwargs)
        seen.append(event)
        if len({e.sensor for e in seen}) == 3:
            risk = engine.incident_risk([e.risk for e in seen], 3)
            comms_guard.on_incident_escalated(list(seen), engine.score_to_level(risk), db=kwargs["db"])
        return event

    monkeypatch.setattr(engine, "record_event", record_and_correlate)
    result = run(db=fake_db)
    assert [e["action"] for e in fake_db.tables["events"].rows][-1] == "message_recalled"
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


def _as_role(fake_db, token_factory, role: str | None) -> dict[str, str]:
    user_id = str(uuid.uuid4())
    if role:
        fake_db.grant_role(user_id, role)
    return {"Authorization": f"Bearer {token_factory(sub=user_id)}"}


def test_endpoint_runs_the_chain_for_red_team_and_saves_the_events(client, fake_db, token_factory):
    headers = _as_role(fake_db, token_factory, "red_team")
    r = client.post("/redteam/run", json={"stage": "full_chain"}, headers=headers)
    assert r.status_code == 200 and r.json()["outcome"] == "blocked"
    assert "exfiltration attempt: ACCESS DENIED" in r.json()["log_lines"]
    rows = fake_db.tables["events"].rows
    assert [(e["sensor"], e["actor"], e["target"], e["source"], e["risk"]) for e in rows[:2]] == [
        ("login_guard", "bot:203.0.113.7", "j.smith", "scripted", 45),
        ("comms_guard", "j.smith", "e.cruz", "scripted", 50),
    ]
    assert rows[0]["raw_features"]["failed_attempts"] == 8 and set(rows[0]["raw_features"]) <= set(FEATURE_KEYS)
    firewall = [e for e in rows if e["sensor"] == "agent_firewall"]
    assert max(e["risk"] for e in firewall) == 55 and any(e["verdict"] == "blocked" for e in firewall)
    assert {(e["actor"], e["target"], e["source"]) for e in firewall} == {("j.smith", "finance_agent", "scripted")}
    recorded = [a for a in fake_db.tables["audit_log"].rows if a["action"] == "event_recorded"]
    assert len(recorded) == len(rows)  # the engine audits every recorded event

    # The real engine links all three listeners into ONE Critical incident and recalls the wire request.
    incidents = fake_db.tables["incidents"].rows
    assert [(i["risk"], i["level"]) for i in incidents] == [(85, "critical")]
    assert rows[-1]["action"] == "message_recalled"
    assert "wire request to e.cruz@cisco.example: RECALLED (no longer in the inbox)" in r.json()["log_lines"]

    bad = client.post("/redteam/run", json={"stage": "rm -rf", "target": "cisco.com"}, headers=headers)
    assert bad.status_code == 422


def test_unprotected_run_through_the_endpoint_leaks(client, fake_db, token_factory):
    headers = _as_role(fake_db, token_factory, "red_team")
    r = client.post("/redteam/run", json={"stage": "full_chain", "target": "unprotected"}, headers=headers)
    assert r.json()["outcome"] == "leaked"
    assert any("exfiltration: SUCCESS" in line for line in r.json()["log_lines"])
    # Login Guard and Comms Guard are out of the path; only the agent's own leak is on record.
    assert {e["sensor"] for e in fake_db.tables["events"].rows} <= {"agent_firewall"}


def test_endpoint_refuses_everyone_without_the_red_team_role(client, fake_db, token_factory):
    body = {"stage": "full_chain"}
    assert client.post("/redteam/run", json=body).status_code == 401
    for role in (None, "approver", "analyst"):
        r = client.post("/redteam/run", json=body, headers=_as_role(fake_db, token_factory, role))
        assert r.status_code == 403, role
    assert fake_db.tables["events"].rows == []


def test_a_failed_save_never_changes_the_verdict():
    class _Down:
        def table(self, _name):
            raise RuntimeError("database down")

        def rpc(self, *_a, **_k):
            raise RuntimeError("database down")

    result = run(db=_Down())
    assert result.outcome == "blocked"  # the firewall still blocked; only the record keeping failed
    assert [e.risk for e in result.events][:2] == [45, 50]
    assert not any(saved(e) for e in result.events)
