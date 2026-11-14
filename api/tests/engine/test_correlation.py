"""Steps 6-8: levels, correlation and incident risk. OWNER: Daylen (P3)."""

from __future__ import annotations

import pytest

from engine import get_incident, incident_risk, list_incidents, risk_math, score_to_level
from engine.correlation import links
from schemas.mitre import TACTIC_ORDER

from .helpers import full_chain, judge_attack, rows, stage1, stage2, stage3


@pytest.mark.parametrize(
    ("risk", "level"),
    [
        (-10, "low"),
        (0, "low"),
        (29, "low"),
        (30, "medium"),
        (59, "medium"),
        (60, "high"),
        (84, "high"),
        (85, "critical"),
        (100, "critical"),
        (999, "critical"),
    ],
)
def test_level_boundaries(risk, level):
    assert score_to_level(risk) == level


def test_incident_risk_formula():
    assert incident_risk([45, 50, 55], 3) == 85  # the demo chain
    assert incident_risk([45], 1) == 45  # one listener: no bonus
    assert incident_risk([45, 50], 2) == 65
    assert incident_risk([90, 90], 3) == 100  # capped
    assert incident_risk([], 0) == 0
    assert risk_math([45, 50, 55], 3) == "55 + 15 x 2 extra listeners = 85"
    assert "capped" in risk_math([90, 90], 3)


def test_link_rule():
    def ev(actor, target, source="scripted"):
        return {"actor": actor, "target": target, "source": source}

    assert links(ev("bot", "j.smith"), ev("bot", "guest02"))  # same actor
    assert links(ev("bot", "j.smith"), ev("j.smith", "finance_agent"))  # takeover chain
    assert not links(ev("j.smith", "finance_agent"), ev("bot", "j.smith"))  # chain only runs forward in time
    assert not links(ev("a", "finance_agent"), ev("b", "finance_agent"))  # shared target alone never links
    assert not links(ev("bot", "j.smith"), ev("bot", "j.smith", "audience"))  # never across sources
    assert not links(ev("judge:a", "guest01", "audience"), ev("guest01", "x", "audience"))  # audience: actor only


def test_scripted_chain_becomes_one_critical_incident(fake_db):
    events = full_chain(fake_db)
    incidents = rows(fake_db, "incidents")
    assert len(incidents) == 1
    incident = get_incident(fake_db, incidents[0]["id"])
    assert (incident.risk, incident.level, incident.source) == (85, "critical", "scripted")
    assert incident.event_ids == [e.id for e in events]
    assert [e.sensor for e in incident.events] == ["login_guard", "comms_guard", "agent_firewall"]
    assert all(e.incident_id == incident.id for e in incident.events)
    assert incident.title == "Account takeover chain: j.smith -> finance_agent"
    assert events[2].incident_id == incident.id  # record_event tells the caller


def test_incident_grows_as_listeners_join(fake_db):
    stage1(fake_db)
    assert rows(fake_db, "incidents") == []  # one listener is not an incident
    stage2(fake_db)
    assert [(i["risk"], i["level"]) for i in rows(fake_db, "incidents")] == [(65, "high")]
    stage3(fake_db)
    assert [(i["risk"], i["level"]) for i in rows(fake_db, "incidents")] == [(85, "critical")]


def test_same_listener_twice_is_not_an_incident(fake_db):
    stage1(fake_db)
    stage1(fake_db)
    assert rows(fake_db, "incidents") == []


def test_two_judges_stay_separate_and_never_join_the_scripted_incident(fake_db):
    full_chain(fake_db)
    judge_attack(fake_db, "agent-falcon")
    judge_attack(fake_db, "night-owl")  # same targets as agent-falcon
    by_source = {s: [i for i in rows(fake_db, "incidents") if i["source"] == s] for s in ("scripted", "audience")}
    assert len(by_source["scripted"]) == 1 and len(by_source["audience"]) == 2
    for incident in by_source["audience"]:
        actors = {e["actor"] for e in rows(fake_db, "events") if e["incident_id"] == incident["id"]}
        assert len(actors) == 1 and next(iter(actors)).startswith("judge:")
    scripted_events = [e for e in rows(fake_db, "events") if e["incident_id"] == by_source["scripted"][0]["id"]]
    assert len(scripted_events) == 3 and all(e["source"] == "scripted" for e in scripted_events)


def test_shared_target_alone_never_links(fake_db):
    stage1(fake_db, actor="bot-a", target="j.smith")
    stage2(fake_db, actor="someone-else", target="j.smith")
    assert rows(fake_db, "incidents") == []


def test_mitre_rolls_up_in_kill_chain_order_without_repeats(fake_db):
    full_chain(fake_db)
    stage1(fake_db)  # repeats the stage 1 techniques
    incident = list_incidents(fake_db)[0]
    tactics = [m.tactic for m in incident.mitre]
    assert tactics == sorted(tactics, key=TACTIC_ORDER.index)
    ids = [m.technique_id for m in incident.mitre]
    assert len(ids) == len(set(ids)) == 8
    assert ids[0] == "T1110.004" and ids[-1] == "T1657"


def test_incidents_list_is_sorted_by_risk_and_filters_by_source(fake_db):
    judge_attack(fake_db, "agent-falcon", sensors=("login_guard", "comms_guard"))  # 40 + 15 = 55
    full_chain(fake_db)  # 85
    assert [i.risk for i in list_incidents(fake_db)] == [85, 55]
    assert [i.source for i in list_incidents(fake_db, source="audience")] == ["audience"]


def test_new_activity_after_a_closed_incident_starts_a_new_one(fake_db):
    full_chain(fake_db)
    first = rows(fake_db, "incidents")[0]
    first["status"] = "closed"
    full_chain(fake_db)
    assert len(rows(fake_db, "incidents")) == 2
    assert len([e for e in rows(fake_db, "events") if e["incident_id"] == first["id"]]) == 3
