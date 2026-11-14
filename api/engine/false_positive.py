"""Marking an incident a false positive. OWNER: Daylen (P3).

Dismissing an incident is a disruptive decision, so it is guarded like containment:
- Low/Medium: closes at once (the caller already holds the analyst or approver role).
- High/Critical: becomes a request an approver confirms on the phone. Until then nothing
  changes: the incident stays open and any pending containment approval stays tappable.
- Anyone who appears as an actor or target in the incident's events is refused, so a
  compromised account can't dismiss the incident about itself.
"""

from __future__ import annotations

from core.errors import AppError
from engine.approvals import FINISHED, request_false_positive_approval
from engine.incidents import _row, close_as_false_positive, get_incident
from engine.util import involves
from schemas.kairos import Incident

CONFIRM_LEVELS = ("high", "critical")


def mark_false_positive(
    db, incident_id: str, *, reason: str, user_id: str, identities=()
) -> tuple[Incident, dict | None]:
    """Returns (incident, pending approval). The approval is None when the incident closed at once.

    `identities` are the caller's names (core.roles.user_identities) for the conflict check.
    """
    incident = _row(db, incident_id)  # 404 for unknown or malformed ids
    if incident["status"] == "contained":
        raise AppError(409, "incident_contained", "This incident was already contained by an approver")
    if incident["status"] in FINISHED:
        raise AppError(409, "incident_not_open", f"This incident is already {incident['status']}")
    events = db.table("events").select("*").eq("incident_id", incident_id).order("created_at").execute().data
    if involves(events, identities):
        raise AppError(403, "conflict_of_interest", "You appear in this incident, so someone else must review it")

    by = f"user:{user_id}"
    if incident["level"] in CONFIRM_LEVELS:
        approval = request_false_positive_approval(db, incident, events, requested_by=by, reason=reason)
        return Incident(**get_incident(db, incident_id).model_dump(exclude={"events"})), approval
    return close_as_false_positive(db, incident_id, by=by, reason=reason), None
