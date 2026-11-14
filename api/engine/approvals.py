"""Human approvals for disruptive actions. OWNER: Daylen (P3).

Locking an account, revoking sessions and freezing an agent ALWAYS wait for a human. If nobody
answers before the timeout the approval expires: paused actions stay paused, nothing is locked.

Approval text is built here from code templates and sanitized names only. It never contains
attacker text or AI-written prose, so the approver cannot be talked into tapping Approve.
"""

from __future__ import annotations

from datetime import timedelta

from core.errors import AppError
from engine.audit import write_audit
from engine.containment import apply_action
from engine.scoring import risk_math
from engine.util import iso, now, parse_ts, safe_name, unique

APPROVAL_TIMEOUT_SECONDS = 300
# Incidents in these states can no longer be contained.
FINISHED = ("closed", "false_positive")

SENSOR_NAMES = {"login_guard": "Login Guard", "comms_guard": "Comms Guard", "agent_firewall": "Agent Firewall"}
_ACTION_TEXT = {
    "lock_account": "lock account {entity}",
    "revoke_sessions": "revoke sessions for {entity}",
    "freeze_agent": "freeze agent {entity}",
}


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
    todo = "; ".join(_ACTION_TEXT[a["action"]].format(entity=a["entity"]) for a in actions)
    plural = "s" if len(events) != 1 else ""
    return (
        f"{str(incident['level']).capitalize()} incident, risk {incident['risk']} ({math}). "
        f"{len(events)} linked event{plural} from {listeners}. "
        f"If approved: {todo or 'no automatic action; review the incident'}. "
        "Nothing is locked until a human approves."
    )


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
    db.table("incidents").update({"status": "investigating"}).eq("id", approval["incident_id"]).eq(
        "status", "awaiting_approval"
    ).execute()
    write_audit(
        db,
        actor="system",
        action="approval_expired",
        detail={"approval_id": approval["id"], "incident_id": approval["incident_id"], "locked": []},
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

    pending = (
        db.table("approvals").select("*").eq("incident_id", incident_id).eq("status", "pending").limit(1).execute()
    ).data
    if pending and not _expired(pending[0]):
        return pending[0]
    if pending:
        _expire(db, pending[0])

    events = db.table("events").select("*").eq("incident_id", incident_id).order("created_at").execute().data
    actions = proposed_actions(events)
    row = {
        "incident_id": incident_id,
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


def decide_approval(db, approval_id: str, *, user_id: str, approve: bool) -> dict:
    """Approve or deny. The caller must already have checked the JWT and the approver role.

    Approve: carry out the listed actions (entity_state) and mark the incident contained.
    Deny: nothing is locked; the incident goes back to the analyst.
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
        detail={"approval_id": approval_id, "incident_id": approval["incident_id"]},
    )
    if approve:
        for action in approval.get("actions") or []:
            apply_action(db, action, by=by)
        db.table("incidents").update({"status": "contained"}).eq("id", approval["incident_id"]).execute()
    else:
        db.table("incidents").update({"status": "investigating"}).eq("id", approval["incident_id"]).eq(
            "status", "awaiting_approval"
        ).execute()
    return approval
