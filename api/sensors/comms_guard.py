"""Comms Guard: the listener for messages. OWNER: Miles (P2).

    result = await handle_message(
        sender="j.smith@cisco.example", to="e.cruz@cisco.example", body=text, source="scripted", db=db
    )

Scores a message for phishing, impersonation and manipulation (detectors.comms), picks a
proportionate response and writes the event through engine.record_event(). The actor is the
sending account and the target is the recipient, so a taken-over account links into its incident.

    Low      watched     allowed   delivered
    Medium   slowed      flagged   delivered with "please verify with the sender another way"
    High     challenged  flagged   held until the recipient verifies
    Critical blocked     blocked   not delivered; appeal available

It prompts verification instead of accusing the sender.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal

import engine
from detectors.comms import AI_MANIPULATION, CommsScore, add_model_points, message_risk, to_detection
from redteam.seed.company import DOMAIN
from schemas.kairos import Detection, Event, Level, MitreTag, Source, Verdict
from schemas.mitre import tag

logger = logging.getLogger("api.sensors.comms_guard")

Response = Literal["watched", "slowed", "challenged", "blocked"]

LADDER: dict[Level, tuple[Response, Verdict]] = {
    "low": ("watched", "allowed"),
    "medium": ("slowed", "flagged"),
    "high": ("challenged", "flagged"),
    "critical": ("blocked", "blocked"),
}

# What the recipient sees. Asks them to verify; never accuses the sender.
USER_MESSAGES: dict[Response, str] = {
    "watched": "",
    "slowed": "Please verify this request with the sender another way (call or in person) before acting on it.",
    "challenged": "This message is on hold. Please verify the request with the sender another way to release it.",
    "blocked": "This message was not delivered. Please verify with the sender directly, or appeal if this looks wrong.",
}


@dataclass(frozen=True)
class MessageResult:
    verdict: Verdict
    detection: Detection
    risk: int
    level: Level
    response: Response
    user_message: str
    event: Event | None


def entity_name(address: str) -> str:
    """'j.smith@cisco.example' -> 'j.smith'. Outside addresses keep their full form."""
    address = address.strip()
    local, _, domain = address.partition("@")
    return local if domain.lower() == DOMAIN or not domain else address


def is_flagged_account(db: Any, entity: str) -> bool:
    """True if Kairos already contained this account (locked or sessions revoked). Lookup errors mean False."""
    if db is None:
        return False
    try:
        query = db.table("entity_state").select("locked,sessions_revoked_at").eq("entity", entity).limit(1)
        rows = query.execute().data
    except Exception:
        logger.warning("comms_guard: entity_state lookup failed; treating sender as not flagged")
        return False
    return bool(rows and (rows[0].get("locked") or rows[0].get("sessions_revoked_at")))


def _mitre(score: CommsScore, sender: str, risk: int) -> list[MitreTag]:
    if risk < 30 or score.technique == AI_MANIPULATION:
        return []
    tags: list[MitreTag] = []
    if sender.lower().endswith(f"@{DOMAIN}") or "@" not in sender:
        tags.append(tag("internal_spearphishing"))
    if score.impersonation:
        tags.append(tag("impersonation"))
    if score.payment:
        tags.append(tag("financial_theft"))
    return tags


async def handle_message(
    *,
    sender: str,
    to: str,
    body: str,
    source: Source,
    db: Any = None,
    actor: str | None = None,
    sender_flagged: bool = False,
    use_model: bool = True,
    record_low: bool = True,
) -> MessageResult:
    """Score one message, pick the response and record the event.

    `actor` defaults to the sending account; pass it for audience attacks (judge:<nickname>).
    use_model=False keeps the score deterministic (scripted chain, DEMO_MODE).
    """
    sender_entity = entity_name(sender)
    flagged_sender = sender_flagged or is_flagged_account(db, sender_entity)
    score = message_risk(body, sender=sender, sender_flagged=flagged_sender)
    note = "Checked by rules only."
    if use_model:
        score, note = await add_model_points(score, body)

    level = engine.score_to_level(score.risk)
    response, verdict = LADDER[level]
    detection = to_detection(score, f"{note} Response: {response}.".strip())

    event = None
    if record_low or level != "low":
        event = engine.record_event(
            sensor="comms_guard",
            actor=actor or sender_entity,
            target=entity_name(to),
            source=source,
            action=f"message_{response}",
            risk=score.risk,
            verdict=verdict,
            reason=detection.explanation,
            mitre=_mitre(score, sender, score.risk),
        )
    return MessageResult(verdict, detection, score.risk, level, response, USER_MESSAGES[response], event)
