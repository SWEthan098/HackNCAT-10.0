"""Reading and updating incidents. OWNER: Daylen (P3)."""

from __future__ import annotations

from core.errors import AppError
from engine.audit import write_audit
from engine.util import is_uuid
from schemas.kairos import Event, Incident, IncidentDetail

OPEN_STATUSES = ("new", "investigating", "awaiting_approval")


def _not_found() -> AppError:
    return AppError(404, "incident_not_found", "No incident with that id")


def _row(db, incident_id: str) -> dict:
    if not is_uuid(incident_id):
        raise _not_found()
    rows = db.table("incidents").select("*").eq("id", incident_id).limit(1).execute().data
    if not rows:
        raise _not_found()
    return rows[0]


def list_incidents(db, *, source: str | None = None, limit: int = 200) -> list[Incident]:
    """Highest risk first, newest first within the same risk."""
    query = db.table("incidents").select("*")
    if source:
        query = query.eq("source", source)
    rows = query.order("risk", desc=True).order("created_at", desc=True).limit(limit).execute().data
    if not rows:
        return []
    ids = [r["id"] for r in rows]
    events = db.table("events").select("id,incident_id,created_at").in_("incident_id", ids).order("created_at")
    by_incident: dict[str, list[str]] = {}
    for e in events.execute().data:
        by_incident.setdefault(e["incident_id"], []).append(e["id"])
    return [Incident(**r, event_ids=by_incident.get(r["id"], [])) for r in rows]


def get_incident(db, incident_id: str) -> IncidentDetail:
    row = _row(db, incident_id)
    events = db.table("events").select("*").eq("incident_id", incident_id).order("created_at").execute().data
    return IncidentDetail(**row, event_ids=[e["id"] for e in events], events=[Event(**e) for e in events])


def close_as_false_positive(
    db, incident_id: str, *, by: str, reason: str | None = None, approval_id: str | None = None
) -> Incident:
    """Close the incident as not an attack. Feeds the false-positive number on the KPI strip.

    The step itself, with no permission checks: engine.false_positive decides whether it may
    happen now (Low/Medium) or needs an approver first (High/Critical). Every other pending
    approval for the incident is cancelled, since a false alarm must not stay tappable.
    """
    row = _row(db, incident_id)
    if row["status"] == "contained":
        raise AppError(409, "incident_contained", "This incident was already contained by an approver")
    db.table("incidents").update({"status": "false_positive"}).eq("id", incident_id).execute()
    cancelled = (
        db.table("approvals")
        .update({"status": "denied"})
        .eq("incident_id", incident_id)
        .eq("status", "pending")
        .execute()
    ).data or []
    detail: dict = {"incident_id": incident_id}
    if reason:
        detail["reason"] = reason[:500]  # typed by a signed-in analyst
    if approval_id:
        detail["approval_id"] = approval_id
    if cancelled:
        detail["cancelled_approvals"] = [a["id"] for a in cancelled]
    write_audit(db, actor=by, action="incident_false_positive", detail=detail)
    return Incident(**get_incident(db, incident_id).model_dump(exclude={"events"}))


def set_incident_summary(db, incident_id: str, *, summary: str | None = None, triage_label: str | None = None) -> None:
    """For the AI analyst (Ethan): store its explanation. It can explain, never change risk or status."""
    fields = {k: v[:2000] for k, v in {"summary": summary, "triage_label": triage_label}.items() if v is not None}
    if fields:
        _row(db, incident_id)
        db.table("incidents").update(fields).eq("id", incident_id).execute()
