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


def mark_false_positive(db, incident_id: str, *, reason: str, user_id: str) -> Incident:
    """An analyst says this was not an attack. Feeds the false-positive number on the KPI strip."""
    row = _row(db, incident_id)
    if row["status"] == "contained":
        raise AppError(409, "incident_contained", "This incident was already contained by an approver")
    db.table("incidents").update({"status": "false_positive"}).eq("id", incident_id).execute()
    # A pending phone approval for a false alarm must not stay tappable.
    db.table("approvals").update({"status": "denied"}).eq("incident_id", incident_id).eq("status", "pending").execute()
    write_audit(
        db,
        actor=f"user:{user_id}",
        action="incident_false_positive",
        detail={"incident_id": incident_id, "reason": reason[:500]},  # typed by a signed-in analyst
    )
    detail = get_incident(db, incident_id)
    return Incident(**detail.model_dump(exclude={"events"}))


def set_incident_summary(db, incident_id: str, *, summary: str | None = None, triage_label: str | None = None) -> None:
    """For the AI analyst (Ethan): store its explanation. It can explain, never change risk or status."""
    fields = {k: v[:2000] for k, v in {"summary": summary, "triage_label": triage_label}.items() if v is not None}
    if fields:
        _row(db, incident_id)
        db.table("incidents").update(fields).eq("id", incident_id).execute()
