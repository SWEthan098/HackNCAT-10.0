"""Kairos core engine. OWNER: Daylen (P3).

The ONLY way anyone writes events: `record_event(...)`. Scoring and correlation live here too.
Thresholds are in one place (LEVEL_THRESHOLDS) so they can be tuned without touching callers.
"""

from __future__ import annotations

import logging
from typing import Any

from core.db import supabase_admin
from core.errors import AppError
from engine.audit import write_audit
from engine.correlation import correlate
from schemas.kairos import Event, Level, MitreTag, Sensor, Source, Verdict

logger = logging.getLogger("api.engine")

# Low 0-29, Medium 30-59, High 60-84, Critical 85-100.
LEVEL_THRESHOLDS: list[tuple[int, Level]] = [(85, "critical"), (60, "high"), (30, "medium"), (0, "low")]
EXTRA_SENSOR_BONUS = 15


def score_to_level(risk: int) -> Level:
    risk = max(0, min(100, risk))
    for floor, level in LEVEL_THRESHOLDS:
        if risk >= floor:
            return level
    return "low"


def incident_risk(event_risks: list[int], sensor_count: int) -> int:
    """Highest linked event risk + 15 for each extra listener involved, capped at 100."""
    if not event_risks:
        return 0
    return min(100, max(event_risks) + EXTRA_SENSOR_BONUS * max(0, sensor_count - 1))


def record_event(
    *,
    sensor: Sensor,
    actor: str,
    target: str,
    source: Source,
    action: str,
    risk: int,
    verdict: Verdict,
    reason: str,
    mitre: list[MitreTag] | None = None,
    raw_features: dict[str, Any] | None = None,
    db=None,
) -> Event:
    """Save one event. The ONLY way anything is written to the `events` table.

    1. Inserts the event (level comes from score_to_level, never from the caller).
    2. Appends a tamper-evident audit entry (facts only, no attacker text).
    3. Runs correlation, which may attach the event to an incident.

    `raw_features` is for Login Guard timing/metadata only (never typed content); it is deleted
    after 24 hours. In a router, pass `db=Depends(get_db)` so tests use the in-memory database;
    without `db` the real Supabase client is used.

    Raises AppError(503) if the event or its audit entry cannot be saved. The caller's own
    allow/block decision does not depend on this call succeeding.
    """
    risk = max(0, min(100, int(risk)))
    tags = [m if isinstance(m, MitreTag) else MitreTag(**m) for m in (mitre or [])]
    row: dict[str, Any] = {
        "sensor": sensor,
        "actor": actor,
        "target": target,
        "source": source,
        "action": action,
        "risk": risk,
        "level": score_to_level(risk),
        "verdict": verdict,
        "reason": reason,
        "mitre": [m.model_dump() for m in tags],
    }
    if raw_features is not None:
        row["raw_features"] = raw_features

    db = db if db is not None else supabase_admin()
    try:
        saved = db.table("events").insert(row).execute().data
        event = Event(**saved[0])
        write_audit(
            db,
            actor=f"sensor:{sensor}",
            action="event_recorded",
            detail={
                "event_id": event.id,
                "actor": actor,
                "target": target,
                "source": source,
                "risk": risk,
                "level": event.level,
                "verdict": verdict,
                "mitre": [m.technique_id for m in tags],
            },
        )
        incident_id = correlate(db, event)
    except AppError:
        raise
    except Exception:
        logger.exception("record_event failed (sensor=%s)", sensor)
        raise AppError(503, "event_not_recorded", "The event could not be saved. Try again.") from None

    if incident_id:
        event = event.model_copy(update={"incident_id": incident_id})
    return event
