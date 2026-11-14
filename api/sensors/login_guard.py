"""Login Guard: the listener for logins. OWNER: Miles (P2).

    result = handle_login("j.smith", features, actor="bot:203.0.113.7", source="scripted", db=db)

Scores timing/metadata (detectors.login), maps the level to a proportionate response and writes
the event through engine.record_event(). Typed content never reaches this module.

    Low      watch      allowed   nothing changes for the person
    Medium   slow       flagged   short delay before the next try
    High     challenge  flagged   "please verify it's you"
    Critical block      blocked   last resort; appeal available

A locked account (entity_state.locked, set only by a human-approved containment) always answers
"account locked". Login Guard never locks an account itself.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal

import engine
from detectors.login import ACCOUNT_TAKEOVER, clean_features, explain, login_risk
from schemas.kairos import Detection, Event, Level, MitreTag, Source, Verdict
from schemas.mitre import tag
from sensors.events import record

logger = logging.getLogger("api.sensors.login_guard")

Response = Literal["watched", "slowed", "challenged", "blocked"]

LADDER: dict[Level, tuple[Response, Verdict]] = {
    "low": ("watched", "allowed"),
    "medium": ("slowed", "flagged"),
    "high": ("challenged", "flagged"),
    "critical": ("blocked", "blocked"),
}

# What the person sees. Never accuses: it asks to verify.
USER_MESSAGES: dict[Response, str] = {
    "watched": "",
    "slowed": "We're seeing a lot of sign-in attempts. Please wait a few seconds and try again.",
    "challenged": "Please verify it's you to continue signing in.",
    "blocked": "Sign-in is paused for now. Please verify it's you, or appeal if this looks wrong.",
}
LOCKED_MESSAGE = "Account locked. Please contact IT to verify it's you, or appeal if this looks wrong."
ACCOUNT_LOCKED = "account locked"
LOCKED_RISK = 60  # a try against a contained account is always worth a High alert


@dataclass(frozen=True)
class LoginResult:
    verdict: Verdict
    detection: Detection
    risk: int
    level: Level
    response: Response
    locked: bool
    user_message: str
    event: Event | None


def is_locked(db: Any, entity: str) -> bool:
    """True if a human-approved containment locked this account.

    If the lookup fails we answer False: a database hiccup must never lock people out. The
    scoring ladder still applies, so attacks are still slowed, challenged or blocked.
    """
    if db is None:
        return False
    try:
        rows = db.table("entity_state").select("locked").eq("entity", entity).limit(1).execute().data
    except Exception:
        logger.warning("login_guard: entity_state lookup failed; treating account as not locked")
        return False
    return bool(rows and rows[0].get("locked"))


def _mitre(technique: str | None, risk: int) -> list[MitreTag]:
    if technique is None or risk < 30:
        return []
    tags = [tag("credential_stuffing")]
    if technique == ACCOUNT_TAKEOVER:
        tags.append(tag("valid_accounts"))
    return tags


def handle_login(
    username: str,
    features: dict[str, Any] | None,
    *,
    actor: str,
    source: Source,
    db: Any = None,
    record_low: bool = True,
) -> LoginResult:
    """Score one login signal, pick the response and record the event.

    record_low=False skips writing an event for an ordinary Low login (used by the public login
    page, so normal sign-ins are not stored at all).
    """
    score = login_risk(features)
    locked = is_locked(db, username)

    if locked:
        risk = max(score.risk, LOCKED_RISK)
        level = engine.score_to_level(risk)
        response, verdict = "blocked", "blocked"
        technique = score.technique or ACCOUNT_LOCKED
        explanation = f"Account locked by an approved containment, so this sign-in was refused. {explain(score)}"
        user_message = LOCKED_MESSAGE
    else:
        risk = score.risk
        level = engine.score_to_level(risk)
        response, verdict = LADDER[level]
        technique = score.technique if risk >= 30 else None
        explanation = f"{explain(score)} Response: {response}."
        user_message = USER_MESSAGES[response]

    detection = Detection(
        flagged=verdict != "allowed", confidence=risk / 100, technique=technique, explanation=explanation
    )

    event = None
    if record_low or level != "low" or locked:
        event = record(
            db,
            sensor="login_guard",
            actor=actor,
            target=username,
            source=source,
            action="login_blocked_account_locked" if locked else f"login_{response}",
            risk=risk,
            verdict=verdict,
            reason=explanation,
            mitre=_mitre(score.technique, risk),
            # Timing/metadata only (already stripped of unknown keys); the engine deletes it after 24h.
            raw_features=clean_features(features),
        )
    return LoginResult(verdict, detection, risk, level, response, locked, user_message, event)
