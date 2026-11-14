"""Appeals against a block. OWNER: Daylen (P3). Minimal on purpose: no separate screen."""

from __future__ import annotations

from core.errors import AppError
from engine.audit import write_audit
from engine.util import is_uuid
from schemas.kairos import Appeal


def create_appeal(db, *, reason: str, event_id: str | None = None, incident_id: str | None = None) -> Appeal:
    """Anyone who was blocked may appeal (public). The reason is their words: show it as plain text."""
    for name, value, table in (("event_id", event_id, "events"), ("incident_id", incident_id, "incidents")):
        if value is None:
            continue
        if not is_uuid(value) or not db.table(table).select("id").eq("id", value).limit(1).execute().data:
            raise AppError(404, "appeal_target_not_found", f"No {name.removesuffix('_id')} with that id")
    row = db.table("appeals").insert({"event_id": event_id, "incident_id": incident_id, "reason": reason}).execute()
    appeal = row.data[0]
    # The reason itself is not audited: it is free text from the public.
    write_audit(
        db,
        actor="public",
        action="appeal_filed",
        detail={"appeal_id": appeal["id"], "event_id": event_id, "incident_id": incident_id},
    )
    return Appeal(**appeal)


def list_appeals(db, *, incident_id: str | None = None, limit: int = 200) -> list[Appeal]:
    query = db.table("appeals").select("*")
    if incident_id:
        if not is_uuid(incident_id):
            return []
        query = query.eq("incident_id", incident_id)
    return [Appeal(**r) for r in query.order("created_at", desc=True).limit(limit).execute().data]
