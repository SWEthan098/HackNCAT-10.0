"""Kairos core engine. OWNER: Daylen (P3).

The ONLY way anyone writes events: `record_event(...)`. Scoring and correlation live here too.
Thresholds are in one place (LEVEL_THRESHOLDS) so they can be tuned without touching callers.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from schemas.kairos import Event, Level, MitreTag, Sensor, Source, Verdict

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
) -> Event:
    """Build an Event. TODO(Daylen): insert into Supabase `events`, write audit_log, run correlation."""
    return Event(
        id=str(uuid.uuid4()),
        created_at=datetime.now(UTC),
        sensor=sensor,
        actor=actor,
        target=target,
        source=source,
        action=action,
        risk=risk,
        level=score_to_level(risk),
        verdict=verdict,
        reason=reason,
        mitre=mitre or [],
    )
