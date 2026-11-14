"""Kairos core engine. OWNER: Daylen (P3).

Everything other folders may import from the engine is listed in __all__ below.

    from engine import record_event, is_locked, is_frozen, publish_attempt

- record_event(...)       the ONLY way events are written
- score_to_level / incident_risk   code decides scores, thresholds live in engine/scoring.py
- is_locked / is_frozen   Login Guard and the Agent Firewall ask these before acting
- publish_attempt(...)    audience attempts + the sanitized public feed
- create_approval(...)    ask a human; set_incident_summary(...) for the AI analyst
"""

from __future__ import annotations

import logging
from typing import Any

from core.db import supabase_admin
from core.errors import AppError
from engine.appeals import create_appeal, list_appeals
from engine.approvals import APPROVAL_TIMEOUT_SECONDS, create_approval, decide_approval, expire_stale_approvals
from engine.audit import verify_audit, write_audit
from engine.containment import ACCOUNT_LOCKED_MESSAGE, freeze_agent, is_frozen, is_locked, kill_switch
from engine.correlation import correlate
from engine.feed import maybe_purge, publish_attempt, purge_raw_login_data, sanitize_text
from engine.incidents import get_incident, list_incidents, mark_false_positive, set_incident_summary
from engine.reset import reset_demo
from engine.scoring import EXTRA_SENSOR_BONUS, LEVEL_THRESHOLDS, clamp_risk, incident_risk, risk_math, score_to_level
from engine.stats import get_stats
from schemas.kairos import Event, MitreTag, Sensor, Source, Verdict

logger = logging.getLogger("api.engine")

__all__ = [
    "ACCOUNT_LOCKED_MESSAGE",
    "APPROVAL_TIMEOUT_SECONDS",
    "EXTRA_SENSOR_BONUS",
    "LEVEL_THRESHOLDS",
    "create_appeal",
    "create_approval",
    "decide_approval",
    "expire_stale_approvals",
    "freeze_agent",
    "get_incident",
    "get_stats",
    "incident_risk",
    "is_frozen",
    "is_locked",
    "kill_switch",
    "list_appeals",
    "list_incidents",
    "mark_false_positive",
    "publish_attempt",
    "purge_raw_login_data",
    "record_event",
    "reset_demo",
    "risk_math",
    "sanitize_text",
    "score_to_level",
    "set_incident_summary",
    "verify_audit",
    "write_audit",
]


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
    3. Runs correlation, which may attach the event to an incident (and, for a Critical scripted
       incident, ask a human for approval).

    `raw_features` is for Login Guard timing/metadata only (never typed content); it is deleted
    after 24 hours. In a router, pass `db=Depends(get_db)` so tests use the in-memory database;
    without `db` the real Supabase client is used.

    Raises AppError(503) if the event or its audit entry cannot be saved. The caller's own
    allow/block decision does not depend on this call succeeding.
    """
    risk = clamp_risk(risk)
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
        maybe_purge(db)
    except AppError:
        raise
    except Exception:
        logger.exception("record_event failed (sensor=%s)", sensor)
        raise AppError(503, "event_not_recorded", "The event could not be saved. Try again.") from None

    if incident_id:
        event = event.model_copy(update={"incident_id": incident_id})
    return event
