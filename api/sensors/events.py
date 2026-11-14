"""One place where Miles's listeners hand events to the engine. OWNER: Miles (P2).

    event = record(db, sensor="login_guard", actor=..., target=..., ...)

Events are written ONLY by engine.record_event(). This wrapper adds the two things every listener
needs around that call:

- The listener's own decision never depends on the save. If the database is down, the failure is
  logged and the listener still returns its verdict, with an unsaved copy of the event.
- With no database at all (db=None: offline scripts, unit tests) nothing is written and nothing
  touches the network; the caller still gets the event it would have recorded.

Unsaved events have `saved(event) == False`; they exist only in memory and never reach the console.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

import engine
from core.errors import AppError
from schemas.kairos import Event, MitreTag, Sensor, Source, Verdict

logger = logging.getLogger("api.sensors")

_UNSAVED_PREFIX = "unsaved-"


def saved(event: Event) -> bool:
    return not event.id.startswith(_UNSAVED_PREFIX)


def record(
    db: Any,
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
) -> Event:
    fields: dict[str, Any] = {
        "sensor": sensor,
        "actor": actor,
        "target": target,
        "source": source,
        "action": action,
        "risk": max(0, min(100, int(risk))),
        "verdict": verdict,
        "reason": reason,
        "mitre": list(mitre or []),
    }
    if db is not None:
        try:
            return engine.record_event(**fields, raw_features=raw_features, db=db)
        except AppError as exc:
            logger.warning("event not saved (sensor=%s action=%s): %s", sensor, action, exc.code)
    return Event(
        id=f"{_UNSAVED_PREFIX}{uuid.uuid4()}",
        created_at=datetime.now(UTC),
        level=engine.score_to_level(fields["risk"]),
        **fields,
    )
