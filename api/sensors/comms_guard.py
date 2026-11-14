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

Recall on escalation: a Medium message is delivered with a warning, so a recipient could still act
on it. Comms Guard therefore remembers every flagged message it delivered, and
`on_incident_escalated(events, level)` (called by the engine when an incident reaches Critical)
pulls those messages back and puts them on hold. A hold is reversible: `release_message()` puts
a message back once a person has verified it. The record is in memory (one API process), holds
no message text, and is cleared by `reset_messages()`.
"""

from __future__ import annotations

import logging
import uuid
from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

import engine
from detectors.comms import AI_MANIPULATION, CommsScore, add_model_points, message_risk, to_detection
from redteam.seed.company import DOMAIN
from schemas.kairos import Detection, Event, Level, MitreTag, Source, Verdict
from schemas.mitre import tag
from sensors import watch
from sensors.events import record

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


RECALL_AT_LEVEL: Level = "critical"
HELD_UNDER_WATCH = (
    "Held by rule: the sending account is under watch after a suspicious sign-in, "
    "so its flagged messages wait for verification."
)
RECALL_NOTICE = "This message was pulled back and is on hold. Please verify the request with the sender another way."
MAX_TRACKED_MESSAGES = 500


@dataclass(frozen=True)
class MessageResult:
    verdict: Verdict
    detection: Detection
    risk: int
    level: Level
    response: Response
    user_message: str
    event: Event | None
    message_id: str | None = None  # set when the message was flagged but delivered (recallable)


@dataclass
class TrackedMessage:
    """A flagged message that was delivered with a warning. No message text is kept."""

    id: str
    actor: str  # who the event was attributed to (the sending account, or judge:<nickname>)
    sender: str
    recipient: str
    source: Source
    risk: int
    mitre: list[MitreTag]
    delivered_at: datetime
    held: bool = False
    held_at: datetime | None = None
    recall_event: Event | None = None
    # The database the original event was saved to, so a later recall is saved to the same place
    # even when the engine's hook does not pass one.
    db: Any = field(default=None, repr=False, compare=False)


_delivered: deque[TrackedMessage] = deque(maxlen=MAX_TRACKED_MESSAGES)


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
    # Fixed rule, separate from the score: a flagged message from an account under watch is held
    # for verification instead of delivered with a warning. The score and level do not change.
    under_watch = watch.watched_account(sender_entity, source=source, actor=actor or sender_entity)
    if under_watch is not None and response == "slowed":
        response = "challenged"
        note = f"{note} {HELD_UNDER_WATCH}".strip()
    detection = to_detection(score, f"{note} Response: {response}.".strip())

    event = None
    if record_low or level != "low":
        event = record(
            db,
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
    message_id = None
    if response == "slowed":  # flagged, but delivered with a warning: remember it so it can be recalled
        message_id = str(uuid.uuid4())
        _delivered.append(
            TrackedMessage(
                id=message_id,
                actor=actor or sender_entity,
                sender=sender_entity,
                recipient=entity_name(to),
                source=source,
                risk=score.risk,
                mitre=_mitre(score, sender, score.risk),
                delivered_at=datetime.now(UTC),
                db=db,
            )
        )
    return MessageResult(verdict, detection, score.risk, level, response, USER_MESSAGES[response], event, message_id)


# ---- recall on escalation ------------------------------------------------------------------


def hold_flagged_messages(actors: Iterable[str], *, source: Source, db: Any = None) -> list[TrackedMessage]:
    """Pull back every flagged, delivered message attributed to these actors (same source only).

    Safe to call again: a message that is already on hold is skipped, so nothing is held or
    recorded twice. Each recall is recorded as an event with the SAME risk as the original
    message, so it explains the action without raising the incident score.
    """
    wanted = set(actors)
    held: list[TrackedMessage] = []
    for message in _delivered:
        if message.held or message.source != source or message.actor not in wanted:
            continue
        message.held, message.held_at = True, datetime.now(UTC)
        held.append(message)
        message.recall_event = record(
            db if db is not None else message.db,
            sensor="comms_guard",
            actor=message.actor,
            target=message.recipient,
            source=source,
            action="message_recalled",
            risk=message.risk,
            verdict="blocked",
            reason=(
                f"A flagged message from {message.sender} to {message.recipient} had been delivered with a warning. "
                "It was pulled back and put on hold because the linked incident reached "
                f"{RECALL_AT_LEVEL}. The hold is reversible: the recipient can release it after verifying."
            ),
            mitre=message.mitre,
        )
    return held


def on_incident_escalated(events: Iterable[Event], level: Level, db: Any = None) -> list[TrackedMessage]:
    """Hook for the engine: call when an incident's level changes. Acts only at Critical.

    `db` is optional: without it each recall is saved to the database its message was recorded in.
    """
    if level != RECALL_AT_LEVEL:
        return []
    events = list(events)
    if not events:
        return []
    sources = {e.source for e in events}
    held: list[TrackedMessage] = []
    for source in sources:
        held += hold_flagged_messages({e.actor for e in events if e.source == source}, source=source, db=db)
    return held


def get_message(message_id: str | None) -> TrackedMessage | None:
    return next((m for m in _delivered if m.id == message_id), None)


def held_messages() -> list[TrackedMessage]:
    return [m for m in _delivered if m.held]


def release_message(message_id: str) -> bool:
    """A person verified the request: put the message back. Returns False if it was not on hold."""
    message = get_message(message_id)
    if message is None or not message.held:
        return False
    message.held, message.held_at = False, None
    return True


def reset_messages() -> None:
    """Forget every tracked message and every account under watch (Reset demo)."""
    _delivered.clear()
    watch.reset()
