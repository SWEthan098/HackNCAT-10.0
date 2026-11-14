"""The engine through the real HTTP endpoints: auth, roles and shapes. OWNER: Daylen (P3)."""

from __future__ import annotations

import pytest

from .helpers import as_role, full_chain, rows, stage1


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/incidents"),
        ("get", "/incidents/00000000-0000-0000-0000-000000000001"),
        ("post", "/incidents/00000000-0000-0000-0000-000000000001/containment"),
        ("post", "/incidents/00000000-0000-0000-0000-000000000001/false-positive"),
        ("post", "/incidents/00000000-0000-0000-0000-000000000001/release"),
        ("post", "/killswitch/off"),
        ("post", "/approvals/00000000-0000-0000-0000-000000000001/approve"),
        ("post", "/approvals/00000000-0000-0000-0000-000000000001/deny"),
        ("get", "/appeals"),
        ("get", "/audit/verify"),
        ("post", "/killswitch"),
        ("post", "/agents/finance_agent/freeze"),
        ("get", "/stats"),
        ("post", "/demo/reset"),
    ],
)
def test_everything_but_filing_an_appeal_needs_a_login(client, method, path):
    assert getattr(client, method)(path).status_code == 401


def test_incident_list_and_detail(client, fake_db, token_factory):
    h, _ = as_role(fake_db, token_factory)
    assert client.get("/incidents", headers=h).json() == []
    events = full_chain(fake_db)

    listed = client.get("/incidents", headers=h).json()
    assert len(listed) == 1 and "events" not in listed[0]
    incident = listed[0]
    assert (incident["risk"], incident["level"], incident["status"]) == (85, "critical", "awaiting_approval")
    assert incident["event_ids"] == [e.id for e in events]

    detail = client.get(f"/incidents/{incident['id']}", headers=h).json()
    assert {e["sensor"] for e in detail["events"]} == {"login_guard", "comms_guard", "agent_firewall"}
    assert [m["technique_id"] for m in detail["mitre"]][0] == "T1110.004"
    assert all(set(m) == {"framework", "tactic", "technique_id", "name"} for m in detail["mitre"])

    assert client.get("/incidents?source=audience", headers=h).json() == []
    assert client.get("/incidents?source=nonsense", headers=h).status_code == 422
    for missing in ("inc-demo", "00000000-0000-0000-0000-000000000009"):
        assert client.get(f"/incidents/{missing}", headers=h).status_code == 404


def test_request_containment_then_approve_from_the_phone(client, fake_db, token_factory):
    analyst, _ = as_role(fake_db, token_factory)
    approver, approver_id = as_role(fake_db, token_factory, "approver")
    stage1(fake_db)
    from .helpers import stage2

    stage2(fake_db)  # High: recommended, not requested
    incident_id = rows(fake_db, "incidents")[0]["id"]

    r = client.post(f"/incidents/{incident_id}/containment", headers=analyst)
    assert r.status_code == 200, r.text
    approval = r.json()
    assert approval["status"] == "pending" and approval["incident_id"] == incident_id
    assert approval["decided_by"] is None and "lock account j.smith" in approval["summary"]
    assert client.post(f"/incidents/{incident_id}/containment", headers=analyst).json()["id"] == approval["id"]

    # Only the approver role may decide.
    assert client.post(f"/approvals/{approval['id']}/approve", headers=analyst).status_code == 403
    assert rows(fake_db, "entity_state") == []

    r = client.post(f"/approvals/{approval['id']}/approve", headers=approver)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved" and r.json()["decided_by"] == approver_id
    assert client.get(f"/incidents/{incident_id}", headers=analyst).json()["status"] == "contained"
    assert {r["entity"] for r in rows(fake_db, "entity_state") if r["locked"]} == {"j.smith"}

    assert client.post(f"/approvals/{approval['id']}/deny", headers=approver).status_code == 409
    assert client.post(f"/incidents/{incident_id}/containment", headers=analyst).status_code == 409
    assert client.post("/approvals/apr-1/approve", headers=approver).status_code == 404
    missing = "/approvals/00000000-0000-0000-0000-000000000009/deny"
    assert client.post(missing, headers=approver).status_code == 404


def test_deny_from_the_phone(client, fake_db, token_factory):
    approver, _ = as_role(fake_db, token_factory, "approver")
    full_chain(fake_db)
    approval_id = rows(fake_db, "approvals")[0]["id"]
    r = client.post(f"/approvals/{approval_id}/deny", headers=approver)
    assert r.status_code == 200 and r.json()["status"] == "denied"
    assert rows(fake_db, "entity_state") == []


def test_false_positive_needs_a_reason_and_a_defender_role(client, fake_db, token_factory):
    plain, _ = as_role(fake_db, token_factory)
    h, _ = as_role(fake_db, token_factory, "analyst")
    stage1(fake_db, risk=20)
    stage1(fake_db, sensor="comms_guard", risk=20)  # 20 + 15 = 35 Medium: closes at once
    incident_id = rows(fake_db, "incidents")[0]["id"]
    url = f"/incidents/{incident_id}/false-positive"
    assert client.post(url, json={"reason": "known pen test"}, headers=plain).status_code == 403
    assert client.post(url, headers=h).status_code == 422
    assert client.post(url, json={"reason": ""}, headers=h).status_code == 422
    r = client.post(url, json={"reason": "known pen test"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "false_positive" and "events" not in r.json()
    assert client.post("/incidents/nope/false-positive", json={"reason": "x"}, headers=h).status_code == 404
    assert client.get("/stats", headers=h).json()["false_positives"] == 1


def test_critical_false_positive_waits_for_a_second_person(client, fake_db, token_factory):
    analyst, _ = as_role(fake_db, token_factory, "analyst")
    phone, _ = as_role(fake_db, token_factory, "approver")
    full_chain(fake_db)
    incident_id = rows(fake_db, "incidents")[0]["id"]
    containment = rows(fake_db, "approvals")[0]

    r = client.post(f"/incidents/{incident_id}/false-positive", json={"reason": "pen test"}, headers=analyst)
    assert r.status_code == 202 and r.json()["status"] == "awaiting_approval"  # nothing changed yet
    assert containment["status"] == "pending"  # the phone can still contain it
    request = next(a for a in rows(fake_db, "approvals") if a["kind"] == "false_positive")
    assert request["summary"].startswith("Confirm false positive: Critical incident, risk 85")
    assert "pen test" not in request["summary"]  # analyst text never reaches the phone

    r = client.post(f"/approvals/{request['id']}/approve", headers=phone)
    assert r.status_code == 200 and r.json()["status"] == "approved"
    assert rows(fake_db, "incidents")[0]["status"] == "false_positive"
    assert containment["status"] == "denied" and rows(fake_db, "entity_state") == []


def test_an_approver_cannot_confirm_their_own_false_positive(client, fake_db, token_factory):
    approver, _ = as_role(fake_db, token_factory, "approver")
    full_chain(fake_db)
    incident_id = rows(fake_db, "incidents")[0]["id"]
    r = client.post(f"/incidents/{incident_id}/false-positive", json={"reason": "x"}, headers=approver)
    assert r.status_code == 202
    request = next(a for a in rows(fake_db, "approvals") if a["kind"] == "false_positive")
    r = client.post(f"/approvals/{request['id']}/approve", headers=approver)
    assert r.status_code == 403 and r.json()["error"]["code"] == "two_person_rule"
    assert rows(fake_db, "incidents")[0]["status"] == "awaiting_approval"


def test_nobody_dismisses_an_incident_they_appear_in(client, fake_db, token_factory):
    import uuid

    uid = str(uuid.uuid4())
    fake_db.grant_role(uid, "analyst")
    fake_db.grant_role(uid, "approver")
    jsmith = {"Authorization": f"Bearer {token_factory(sub=uid, email='j.smith@cisco.example')}"}
    full_chain(fake_db)  # j.smith is the taken-over account in every stage
    incident_id = rows(fake_db, "incidents")[0]["id"]
    r = client.post(f"/incidents/{incident_id}/false-positive", json={"reason": "it was me"}, headers=jsmith)
    assert r.status_code == 403 and r.json()["error"]["code"] == "conflict_of_interest"

    analyst, _ = as_role(fake_db, token_factory, "analyst")
    client.post(f"/incidents/{incident_id}/false-positive", json={"reason": "pen test"}, headers=analyst)
    request = next(a for a in rows(fake_db, "approvals") if a["kind"] == "false_positive")
    r = client.post(f"/approvals/{request['id']}/approve", headers=jsmith)
    assert r.status_code == 403 and r.json()["error"]["code"] == "conflict_of_interest"
    assert client.post(f"/approvals/{request['id']}/deny", headers=jsmith).status_code == 200  # refusing is safe
    assert rows(fake_db, "incidents")[0]["status"] == "awaiting_approval"


def test_kill_switch_and_freeze(client, fake_db, token_factory):
    import engine

    plain, _ = as_role(fake_db, token_factory)
    assert client.post("/killswitch", headers=plain).status_code == 403
    assert client.post("/agents/finance_agent/freeze", headers=plain).status_code == 403
    assert not engine.is_frozen(fake_db, "finance_agent")

    h, uid = as_role(fake_db, token_factory, "analyst")
    r = client.post("/agents/finance_agent/freeze", headers=h)
    assert r.status_code == 200 and r.json() == {"ok": True, "detail": "finance_agent frozen"}
    assert engine.is_frozen(fake_db, "finance_agent") and not engine.is_frozen(fake_db, "hr_agent")
    assert client.post("/killswitch", headers=h).json()["ok"] is True
    assert engine.is_frozen(fake_db, "hr_agent")
    assert rows(fake_db, "audit_log")[-1]["actor"] == f"user:{uid}"


def _contained(client, fake_db, phone) -> str:
    """Run the full chain and approve its containment: j.smith locked, finance_agent frozen."""
    full_chain(fake_db)
    containment = rows(fake_db, "approvals")[0]
    assert client.post(f"/approvals/{containment['id']}/approve", headers=phone).status_code == 200
    return containment["incident_id"]


def test_release_goes_through_the_phone(client, fake_db, token_factory):
    import engine
    from sensors import watch

    analyst, _ = as_role(fake_db, token_factory, "analyst")
    phone, phone_id = as_role(fake_db, token_factory, "approver")
    plain, _ = as_role(fake_db, token_factory)
    incident_id = _contained(client, fake_db, phone)
    watch.reset()
    watch.watch_takeover("j.smith", source="scripted", by="bot:203.0.113.7")
    url = f"/incidents/{incident_id}/release"

    assert client.post(url).status_code == 401
    assert client.post(url, headers=plain).status_code == 403
    r = client.post(url, headers=analyst)
    assert r.status_code == 200, r.text
    approval = r.json()
    assert approval["status"] == "pending" and approval["incident_id"] == incident_id
    assert approval["summary"].startswith("Unlock j.smith and unfreeze finance_agent? ")
    assert client.post(url, headers=analyst).json()["id"] == approval["id"]  # asking twice: same one
    assert engine.is_locked(fake_db, "j.smith")  # nothing undone yet

    r = client.post(f"/approvals/{approval['id']}/approve", headers=phone)
    assert r.status_code == 200 and r.json()["decided_by"] == phone_id
    assert not engine.is_locked(fake_db, "j.smith") and not engine.is_frozen(fake_db, "finance_agent")
    assert watch.watched_account("j.smith", source="scripted", actor="j.smith") is None
    assert rows(fake_db, "incidents")[0]["status"] == "closed"
    actions = {r["action"] for r in rows(fake_db, "audit_log")}
    assert {"release_requested", "account_unlocked", "agent_unfrozen"} <= actions
    assert client.post(url, headers=analyst).status_code == 409  # no longer contained
    watch.reset()


def test_release_rules(client, fake_db, token_factory):
    import uuid

    import engine

    analyst, _ = as_role(fake_db, token_factory, "analyst")
    phone, _ = as_role(fake_db, token_factory, "approver")
    full_chain(fake_db)
    incident_id = rows(fake_db, "incidents")[0]["id"]
    url = f"/incidents/{incident_id}/release"
    r = client.post(url, headers=analyst)
    assert r.status_code == 409 and r.json()["error"]["code"] == "incident_not_contained"
    client.post(f"/approvals/{rows(fake_db, 'approvals')[0]['id']}/approve", headers=phone)

    # j.smith can't ask to unlock themselves, nor approve it.
    uid = str(uuid.uuid4())
    fake_db.grant_role(uid, "analyst")
    fake_db.grant_role(uid, "approver")
    jsmith = {"Authorization": f"Bearer {token_factory(sub=uid, email='j.smith@cisco.example')}"}
    assert client.post(url, headers=jsmith).json()["error"]["code"] == "conflict_of_interest"
    request = client.post(url, headers=analyst).json()
    r = client.post(f"/approvals/{request['id']}/approve", headers=jsmith)
    assert r.status_code == 403 and r.json()["error"]["code"] == "conflict_of_interest"

    # The approver who asked can't approve their own request; deny keeps everything locked.
    mine = client.post(f"/approvals/{request['id']}/deny", headers=phone)
    assert mine.status_code == 200 and engine.is_locked(fake_db, "j.smith")
    request = client.post(url, headers=phone).json()
    r = client.post(f"/approvals/{request['id']}/approve", headers=phone)
    assert r.status_code == 403 and r.json()["error"]["code"] == "two_person_rule"
    assert rows(fake_db, "incidents")[0]["status"] == "contained"


def test_release_only_lists_what_is_still_held(client, fake_db, token_factory):
    from engine.containment import unlock_account

    analyst, _ = as_role(fake_db, token_factory, "analyst")
    phone, _ = as_role(fake_db, token_factory, "approver")
    incident_id = _contained(client, fake_db, phone)
    unlock_account(fake_db, "j.smith", by="test")
    request = client.post(f"/incidents/{incident_id}/release", headers=analyst).json()
    assert request["summary"].startswith("Unfreeze finance_agent? ")
    assert rows(fake_db, "approvals")[-1]["actions"] == [{"action": "unfreeze_agent", "entity": "finance_agent"}]


def test_kill_switch_off_needs_an_approver(client, fake_db, token_factory):
    import engine

    analyst, _ = as_role(fake_db, token_factory, "analyst")
    phone, _ = as_role(fake_db, token_factory, "approver")
    client.post("/killswitch", headers=analyst)
    assert client.post("/killswitch/off", headers=analyst).status_code == 403  # stopping is easy, undoing is not
    assert engine.is_frozen(fake_db, "hr_agent")
    assert client.post("/killswitch/off", headers=phone).status_code == 200
    assert not engine.is_frozen(fake_db, "hr_agent")


def test_false_positive_on_a_contained_incident_offers_to_undo_it(client, fake_db, token_factory):
    import engine

    analyst, _ = as_role(fake_db, token_factory, "analyst")
    phone, _ = as_role(fake_db, token_factory, "approver")
    full_chain(fake_db)
    incident_id = rows(fake_db, "incidents")[0]["id"]
    containment = rows(fake_db, "approvals")[0]
    assert client.post(f"/approvals/{containment['id']}/approve", headers=phone).status_code == 200
    assert engine.is_locked(fake_db, "j.smith") and engine.is_frozen(fake_db, "finance_agent")

    r = client.post(f"/incidents/{incident_id}/false-positive", json={"reason": "pen test"}, headers=analyst)
    assert r.status_code == 202 and r.json()["status"] == "contained"  # nothing undone yet
    request = next(a for a in rows(fake_db, "approvals") if a["kind"] == "false_positive")
    assert "unlock account j.smith" in request["summary"] and "unfreeze agent finance_agent" in request["summary"]
    assert engine.is_locked(fake_db, "j.smith")

    r = client.post(f"/approvals/{request['id']}/approve", headers=phone)
    assert r.status_code == 200, r.text
    assert rows(fake_db, "incidents")[0]["status"] == "false_positive"
    assert not engine.is_locked(fake_db, "j.smith") and not engine.is_frozen(fake_db, "finance_agent")


def test_denying_a_contained_false_positive_keeps_the_containment(client, fake_db, token_factory):
    import engine

    analyst, _ = as_role(fake_db, token_factory, "analyst")
    phone, _ = as_role(fake_db, token_factory, "approver")
    full_chain(fake_db)
    incident_id = rows(fake_db, "incidents")[0]["id"]
    client.post(f"/approvals/{rows(fake_db, 'approvals')[0]['id']}/approve", headers=phone)
    from engine.containment import unlock_account

    unlock_account(fake_db, "j.smith", by="test")  # already released some other way

    client.post(f"/incidents/{incident_id}/false-positive", json={"reason": "x"}, headers=analyst)
    request = next(a for a in rows(fake_db, "approvals") if a["kind"] == "false_positive")
    assert request["actions"] == [{"action": "unfreeze_agent", "entity": "finance_agent"}]  # only what's still on
    assert client.post(f"/approvals/{request['id']}/deny", headers=phone).status_code == 200
    assert rows(fake_db, "incidents")[0]["status"] == "contained"
    assert engine.is_frozen(fake_db, "finance_agent")


def test_audit_verify_endpoint(client, fake_db, token_factory):
    h, _ = as_role(fake_db, token_factory)
    full_chain(fake_db)
    body = client.get("/audit/verify", headers=h).json()
    assert body["ok"] is True and body["entries_checked"] >= 5 and body["first_bad_entry"] is None
    rows(fake_db, "audit_log")[0]["actor"] = "someone-else"
    body = client.get("/audit/verify", headers=h).json()
    assert body["ok"] is False and body["first_bad_entry"] == "1"


def test_appeals_endpoints(client, fake_db, token_factory, monkeypatch):
    import routers.appeals as appeals

    monkeypatch.setattr(appeals, "_hits", {})
    monkeypatch.setattr(appeals, "_all", appeals.deque())
    h, _ = as_role(fake_db, token_factory)
    full_chain(fake_db)
    incident_id = rows(fake_db, "incidents")[0]["id"]

    r = client.post("/appeals", json={"reason": "I was just asking a normal question", "incident_id": incident_id})
    assert r.status_code == 200 and r.json()["status"] == "open" and r.json()["incident_id"] == incident_id
    assert client.post("/appeals", json={"reason": "x", "incident_id": "nope"}).status_code == 404
    assert client.post("/appeals", json={"reason": ""}).status_code == 422
    assert len(client.get("/appeals", headers=h).json()) == 1
    assert len(client.get(f"/appeals?incident_id={incident_id}", headers=h).json()) == 1

    statuses = [client.post("/appeals", json={"reason": "again"}).status_code for _ in range(6)]
    assert statuses.count(200) == 3 and statuses[-1] == 429  # 5 per minute per client, 2 already used


def test_stats_and_reset_endpoints(client, fake_db, token_factory):
    h, _ = as_role(fake_db, token_factory)
    red, _ = as_role(fake_db, token_factory, "red_team")
    full_chain(fake_db)
    stats = client.get("/stats", headers=h).json()
    assert stats["attacks_blocked"] == 1 and stats["open_incidents"]["critical"] == 1

    assert client.post("/demo/reset", headers=h).status_code == 403
    r = client.post("/demo/reset", headers=red)
    assert r.status_code == 200 and r.json()["ok"] is True
    assert client.get("/incidents", headers=h).json() == []
    assert client.get("/stats", headers=h).json()["open_incidents"]["critical"] == 0
    assert client.get("/audit/verify", headers=h).json()["ok"] is True
