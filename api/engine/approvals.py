"""Human approvals for disruptive actions. OWNER: Daylen (P3).

Locking an account, revoking sessions and freezing an agent ALWAYS wait for a human. If nobody
answers before the timeout the approval expires: paused actions stay paused, nothing is locked.

Approval text is built here from code templates and sanitized names only. It never contains
attacker text or AI-written prose, so the approver cannot be talked into tapping Approve.

Two kinds of approval share the phone:
- containment     lock / revoke / freeze. Approve = do it, incident contained.
- false_positive  an analyst says a High/Critical incident was not an attack. Approve = close it
                  as a false positive (and cancel pending containment). Until then nothing
                  changes. The approver can't be the person who asked, or anyone who appears
                  in the incident's events. If the incident was already contained, the
                  request lists the locks/freezes still in force and approving undoes them.
- release         an analyst asks to lift a contained incident's containment. Approve = unlock
                  the accounts and unfreeze the agents still held (accounts also leave the
                  watch list), incident closed. Same two-person and conflict rules.
"""

from __future__ import annotations

from datetime import timedelta

from core.errors import AppError
from engine.audit import write_audit
from engine.containment import UNDO, apply_action, still_in_force
from engine.incidents import close_as_false_positive
from engine.scoring import risk_math
from engine.util import involves, iso, now, parse_ts, safe_name, unique

APPROVAL_TIMEOUT_SECONDS = 300
CONTAINMENT = "containment"
FALSE_POSITIVE = "false_positive"
RELEASE = "release"
# Incidents in these states can no longer be contained.
FINISHED = ("closed", "false_positive")

SENSOR_NAMES = {"login_guard": "Login Guard", "comms_guard": "Comms Guard", "agent_firewall": "Agent Firewall"}
_ACTION_TEXT = {
    "lock_account": "lock account {entity}",
    "revoke_sessions": "revoke sessions for {entity}",
    "freeze_agent": "freeze agent {entity}",
    "unlock_account": "unlock account {entity}",
    "unfreeze_agent": "unfreeze agent {entity}",
}


def _todo(actions: list[dict]) -> str:
    return "; ".join(_ACTION_TEXT[a["action"]].format(entity=a["entity"]) for a in actions)


def undo_actions(db, incident_id: str) -> list[dict]:
    """What approved containment for this incident locked or froze that is still in force."""
    approved = (
        db.table("approvals")
        .select("*")
        .eq("incident_id", incident_id)
        .eq("status", "approved")
        .eq("kind", CONTAINMENT)
        .execute()
    ).data or []
    done = [a for ap in approved for a in (ap.get("actions") or []) if a.get("action") in UNDO]
    undo = [{"action": UNDO[a["action"]], "entity": a["entity"]} for a in done if still_in_force(db, a)]
    return list({(a["action"], a["entity"]): a for a in undo}.values())


def proposed_actions(events: list[dict]) -> list[dict]:
    """Accounts whose logins were attacked get locked + signed out; agents that were targeted get frozen."""
    accounts = unique(safe_name(e["target"]) for e in events if e["sensor"] == "login_guard")
    agents = unique(safe_name(e["target"]) for e in events if e["sensor"] == "agent_firewall")
    actions: list[dict] = []
    for account in accounts:
        actions.append({"action": "lock_account", "entity": account})
        actions.append({"action": "revoke_sessions", "entity": account})
    for agent in agents:
        actions.append({"action": "freeze_agent", "entity": agent})
    return actions


def approval_summary(incident: dict, events: list[dict], actions: list[dict]) -> str:
    sensors = unique(e["sensor"] for e in events)
    math = risk_math([e["risk"] for e in events], len(sensors))
    listeners = ", ".join(SENSOR_NAMES.get(s, s) for s in sensors) or "no listeners"
    todo = _todo(actions)
    plural = "s" if len(events) != 1 else ""
    return (
        f"{str(incident['level']).capitalize()} incident, risk {incident['risk']} ({math}). "
        f"{len(events)} linked event{plural} from {listeners}. "
        f"If approved: {todo or 'no automatic action; review the incident'}. "
        "Nothing is locked until a human approves."
    )


def false_positive_summary(incident: dict, events: list[dict], undo: list[dict] | None = None) -> str:
    sensors = unique(e["sensor"] for e in events)
    math = risk_math([e["risk"] for e in events], len(sensors))
    listeners = ", ".join(SENSOR_NAMES.get(s, s) for s in sensors) or "no listeners"
    plural = "s" if len(events) != 1 else ""
    if incident["status"] == "contained":
        then = f"close the incident as a false positive and undo its containment: {_todo(undo or []) or 'nothing'}"
        unchanged = "nothing changes and the containment stays in place"
    else:
        then = "close the incident as a false positive and cancel any pending containment"
        unchanged = "nothing changes and the incident stays open"
    return (
        f"Confirm false positive: {str(incident['level']).capitalize()} incident, risk {incident['risk']} "
        f"({math}). {len(events)} linked event{plural} from {listeners}. "
        "An analyst says this was not an attack. "
        f"If approved: {then}. If denied or unanswered: {unchanged}."
    )


def release_summary(incident: dict, undo: list[dict]) -> str:
    """'Unlock j.smith and unfreeze finance_agent?' plus the facts. Code template, safe names only."""
    verbs = {"unlock_account": "unlock", "unfreeze_agent": "unfreeze"}
    parts = [f"{verbs[a['action']]} {a['entity']}" for a in undo]
    question = (", ".join(parts[:-1]) + " and " + parts[-1]) if len(parts) > 1 else parts[0]
    return (
        f"{question[0].upper()}{question[1:]}? "
        f"Lift containment on a {str(incident['level']).capitalize()} incident, risk {incident['risk']}. "
        f"If approved: {_todo(undo)}; the incident is closed. Signed-out sessions stay signed out. "
        "If denied or unanswered: everything stays locked."
    )


def _kind(approval: dict) -> str:
    return approval.get("kind") or CONTAINMENT


def _events(db, incident_id: str) -> list[dict]:
    return db.table("events").select("*").eq("incident_id", incident_id).order("created_at").execute().data


def _incident(db, incident_id: str) -> dict:
    rows = db.table("incidents").select("*").eq("id", incident_id).limit(1).execute().data
    if not rows:
        raise AppError(404, "incident_not_found", "No incident with that id")
    return rows[0]


def _expired(approval: dict) -> bool:
    return bool(approval.get("expires_at")) and parse_ts(approval["expires_at"]) <= now()


def _expire(db, approval: dict) -> None:
    """Timeout: the approval closes, the incident goes back to the analyst, nothing is locked."""
    changed = (
        db.table("approvals").update({"status": "expired"}).eq("id", approval["id"]).eq("status", "pending").execute()
    ).data
    if not changed:
        return
    if _kind(approval) == CONTAINMENT:
        db.table("incidents").update({"status": "investigating"}).eq("id", approval["incident_id"]).eq(
            "status", "awaiting_approval"
        ).execute()
    # An unanswered false-positive request changes nothing: the incident simply stays open.
    write_audit(
        db,
        actor="system",
        action="approval_expired",
        detail={
            "approval_id": approval["id"],
            "incident_id": approval["incident_id"],
            "kind": _kind(approval),
            "locked": [],
        },
    )


def expire_stale_approvals(db) -> int:
    """Close every pending approval whose time is up. Safe to call often."""
    stale = db.table("approvals").select("*").eq("status", "pending").lt("expires_at", iso(now())).execute().data
    for approval in stale:
        _expire(db, approval)
    return len(stale)


def create_approval(db, incident_id: str, *, requested_by: str = "system") -> dict:
    """Ask a human to approve containment for an incident. Returns the pending approval row.

    One pending approval per incident: asking again returns the one already waiting.
    """
    incident = _incident(db, incident_id)
    if incident["status"] in FINISHED or incident["status"] == "contained":
        raise AppError(409, "incident_not_open", f"This incident is already {incident['status']}")

    pending = _pending(db, incident_id, CONTAINMENT)
    if pending:
        return pending

    events = _events(db, incident_id)
    actions = proposed_actions(events)
    row = {
        "incident_id": incident_id,
        "kind": CONTAINMENT,
        "requested_by": requested_by,
        "status": "pending",
        "summary": approval_summary(incident, events, actions),
        "actions": actions,
        "expires_at": iso(now() + timedelta(seconds=APPROVAL_TIMEOUT_SECONDS)),
    }
    approval = db.table("approvals").insert(row).execute().data[0]
    db.table("incidents").update({"status": "awaiting_approval"}).eq("id", incident_id).execute()
    write_audit(
        db,
        actor=requested_by,
        action="approval_requested",
        detail={"approval_id": approval["id"], "incident_id": incident_id, "actions": actions},
    )
    return approval


def _pending(db, incident_id: str, kind: str) -> dict | None:
    """The live pending approval of this kind for the incident; a timed-out one is expired first."""
    rows = (
        db.table("approvals")
        .select("*")
        .eq("incident_id", incident_id)
        .eq("status", "pending")
        .eq("kind", kind)
        .limit(1)
        .execute()
    ).data
    if rows and not _expired(rows[0]):
        return rows[0]
    if rows:
        _expire(db, rows[0])
    return None


def request_false_positive_approval(db, incident: dict, events: list[dict], *, requested_by: str, reason: str) -> dict:
    """Ask an approver to confirm that a High/Critical incident was a false positive.

    Nothing changes until they approve: the incident stays open and any pending containment
    stays tappable. Asking again returns the request already waiting.
    """
    pending = _pending(db, incident["id"], FALSE_POSITIVE)
    if pending:
        return pending
    # If the incident was already contained, approving also undoes what is still locked/frozen.
    undo = undo_actions(db, incident["id"]) if incident["status"] == "contained" else []
    row = {
        "incident_id": incident["id"],
        "kind": FALSE_POSITIVE,
        "requested_by": requested_by,
        "status": "pending",
        "summary": false_positive_summary(incident, events, undo),
        "actions": undo,
        "expires_at": iso(now() + timedelta(seconds=APPROVAL_TIMEOUT_SECONDS)),
    }
    approval = db.table("approvals").insert(row).execute().data[0]
    write_audit(
        db,
        actor=requested_by,
        action="false_positive_requested",
        detail={"approval_id": approval["id"], "incident_id": incident["id"], "reason": reason[:500]},
    )
    return approval


def request_release(db, incident_id: str, *, requested_by: str, identities=()) -> dict:
    """Ask an approver to lift a contained incident's containment. Returns the pending approval.

    Lists only what is still locked/frozen. Asking again returns the request already waiting.
    Refused for anyone who appears in the incident (nobody asks to unlock themselves).
    """
    incident = _incident(db, incident_id)
    if incident["status"] != "contained":
        raise AppError(409, "incident_not_contained", "Only a contained incident can have its containment lifted")
    if involves(_events(db, incident_id), identities):
        raise AppError(403, "conflict_of_interest", "You appear in this incident, so someone else must ask")
    pending = _pending(db, incident_id, RELEASE)
    if pending:
        return pending
    undo = undo_actions(db, incident_id)
    if not undo:
        raise AppError(409, "nothing_to_release", "Nothing from this incident is still locked or frozen")
    row = {
        "incident_id": incident_id,
        "kind": RELEASE,
        "requested_by": requested_by,
        "status": "pending",
        "summary": release_summary(incident, undo),
        "actions": undo,
        "expires_at": iso(now() + timedelta(seconds=APPROVAL_TIMEOUT_SECONDS)),
    }
    approval = db.table("approvals").insert(row).execute().data[0]
    write_audit(
        db,
        actor=requested_by,
        action="release_requested",
        detail={"approval_id": approval["id"], "incident_id": incident_id, "actions": undo},
    )
    return approval


def _check_second_person(db, approval: dict, *, user_id: str, approve: bool, identities) -> None:
    """Letting something back in needs two people, neither of them involved in the incident."""
    if approval.get("requested_by") == f"user:{user_id}":
        raise AppError(403, "two_person_rule", "Someone other than the person who asked must decide this")
    if not approve:
        return  # refusing is always safe
    incident = _incident(db, approval["incident_id"])
    if incident["status"] in FINISHED:
        raise AppError(409, "incident_not_open", f"This incident is already {incident['status']}")
    if _kind(approval) == RELEASE and incident["status"] != "contained":
        raise AppError(409, "incident_not_contained", f"This incident is {incident['status']}, not contained")
    if involves(_events(db, approval["incident_id"]), identities):
        raise AppError(403, "conflict_of_interest", "You appear in this incident, so another approver must decide")


def _cancel_other_pending(db, incident_id: str, *, by: str) -> None:
    """After containment is approved, a waiting false-positive request is moot."""
    cancelled = (
        db.table("approvals")
        .update({"status": "denied"})
        .eq("incident_id", incident_id)
        .eq("status", "pending")
        .execute()
    ).data or []
    if cancelled:
        write_audit(
            db,
            actor=by,
            action="approval_superseded",
            detail={"incident_id": incident_id, "cancelled_approvals": [a["id"] for a in cancelled]},
        )


def decide_approval(db, approval_id: str, *, user_id: str, approve: bool, identities=()) -> dict:
    """Approve or deny. The caller must already have checked the JWT and the approver role.

    Containment. Approve: carry out the listed actions (entity_state), mark the incident
    contained. Deny: nothing is locked; the incident goes back to the analyst.
    False positive. Approve: close the incident as a false positive. Deny: nothing changes.
    `identities` are the decider's names (core.roles.user_identities), for the conflict check.
    """
    rows = db.table("approvals").select("*").eq("id", approval_id).limit(1).execute().data
    if not rows:
        raise AppError(404, "approval_not_found", "No approval with that id")
    approval = rows[0]
    if approval["status"] != "pending":
        raise AppError(409, "approval_not_pending", f"This approval is already {approval['status']}")
    if _expired(approval):
        _expire(db, approval)
        raise AppError(409, "approval_expired", "This approval timed out. Nothing was locked.")
    kind = _kind(approval)
    if kind in (FALSE_POSITIVE, RELEASE):
        _check_second_person(db, approval, user_id=user_id, approve=approve, identities=identities)

    status = "approved" if approve else "denied"
    # The status filter makes a double tap (or two approvers) decide only once.
    updated = (
        db.table("approvals")
        .update({"status": status, "decided_by": user_id, "decided_at": iso(now())})
        .eq("id", approval_id)
        .eq("status", "pending")
        .execute()
    ).data
    if not updated:
        raise AppError(409, "approval_not_pending", "This approval was just decided by someone else")
    approval = updated[0]

    by = f"user:{user_id}"
    write_audit(
        db,
        actor=by,
        action=f"approval_{status}",
        detail={"approval_id": approval_id, "incident_id": approval["incident_id"], "kind": kind},
    )
    if kind == FALSE_POSITIVE:
        if approve:
            for action in approval.get("actions") or []:  # only ever unlock / unfreeze
                apply_action(db, action, by=by)
            close_as_false_positive(db, approval["incident_id"], by=by, approval_id=approval_id)
        return approval
    if kind == RELEASE:
        if approve:
            for action in approval.get("actions") or []:  # only ever unlock / unfreeze
                apply_action(db, action, by=by)
            db.table("incidents").update({"status": "closed"}).eq("id", approval["incident_id"]).execute()
            _cancel_other_pending(db, approval["incident_id"], by=by)
        return approval
    if approve:
        for action in approval.get("actions") or []:
            apply_action(db, action, by=by)
        db.table("incidents").update({"status": "contained"}).eq("id", approval["incident_id"]).execute()
        _cancel_other_pending(db, approval["incident_id"], by=by)
    else:
        db.table("incidents").update({"status": "investigating"}).eq("id", approval["incident_id"]).eq(
            "status", "awaiting_approval"
        ).execute()
    return approval
