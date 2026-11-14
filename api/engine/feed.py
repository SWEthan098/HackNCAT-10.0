"""Public feed sanitizer + privacy clean-up. OWNER: Daylen (P3).

`public_feed` is the ONLY table anyone on the internet can read (the audience live counter). Its
text is built here from a code template and filtered values. The attacker's message is stored in
`attempts` (team only) and never copied to the public feed.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import timedelta

from engine.util import iso, now

logger = logging.getLogger("api.engine")

RAW_LOGIN_RETENTION_HOURS = 24
PURGE_EVERY_SECONDS = 15 * 60
VERDICTS = ("allowed", "flagged", "blocked")

_PATTERNS = [
    re.compile(r"!?\[[^\]]*\]\([^)]*\)"),  # markdown links and images
    re.compile(r"<[^>]*>"),  # html tags
    re.compile(r"(?:https?://|www\.)\S+", re.I),  # links
    re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b"),  # email addresses
    re.compile(r"\b(?:\d[ -]?){9,19}\b"),  # long digit runs: SSNs, card and phone numbers
]
_NOT_PLAIN = re.compile(r"[^A-Za-z0-9 .,:;!?'()/_-]")
_SPACES = re.compile(r"\s+")
_CONTROL = re.compile(r"[\s\x00-\x1f\x7f]+")
_last_purge = 0.0


def sanitize_text(text: str | None, max_len: int = 140) -> str:
    """Plain text only: no links, images, HTML, emails, long numbers or control characters."""
    out = _CONTROL.sub(" ", str(text or ""))
    for pattern in _PATTERNS:
        out = pattern.sub(" ", out)
    out = _NOT_PLAIN.sub("", out)
    return _SPACES.sub(" ", out).strip()[:max_len]


def _token(text: str | None, max_len: int, fallback: str) -> str:
    return sanitize_text(text, max_len) or fallback


def publish_attempt(
    db,
    *,
    nickname: str,
    attack_type: str,
    verdict: str,
    blocked_by: str | None = None,
    layers_reached: int = 0,
    technique: str | None = None,
    breach: bool = False,
    reason: str | None = None,
    message: str | None = None,
) -> dict:
    """Record one audience attempt (team-only `attempts`) and its sanitized public copy.

    For /attack (Ethan) and /playground/launch (Miles). Returns the public_feed row.
    """
    if verdict not in VERDICTS:
        raise ValueError(f"verdict must be one of {VERDICTS}")
    nick = _token(nickname, 24, "anonymous")
    kind = _token(attack_type, 40, "attack")
    tech = _token(technique, 60, "") or None
    layers = max(0, int(layers_reached))
    db.table("attempts").insert(
        {
            "nickname": nick,
            "attack_type": kind,
            "message": (message or "")[:500] or None,
            "verdict": verdict,
            "blocked_by": blocked_by,
            "layers_reached": layers,
            "technique": tech,
            "breach": bool(breach),
            "reason": reason,
        }
    ).execute()
    outcome = {"blocked": "was blocked", "flagged": "was flagged", "allowed": "got a normal answer"}[verdict]
    summary = f"{nick} tried {kind} and {outcome}" + (f" ({tech})" if tech else "") + "."
    row = {
        "nickname": nick,
        "attack_type": kind,
        "verdict": verdict,
        "layers_reached": layers,
        "technique": tech,
        "breach": bool(breach),  # the counter reads this; never guess breaches from layers
        "summary": sanitize_text(summary, 200),
    }
    return db.table("public_feed").insert(row).execute().data[0]


def purge_raw_login_data(db, *, older_than_hours: int = RAW_LOGIN_RETENTION_HOURS) -> int:
    """Delete raw login timing data older than 24h. The event and its score stay."""
    cutoff = iso(now() - timedelta(hours=older_than_hours))
    cleared = (
        db.table("events")
        .update({"raw_features": None})
        .lt("created_at", cutoff)
        .not_.is_("raw_features", "null")
        .execute()
    ).data
    return len(cleared or [])


def maybe_purge(db) -> None:
    """Run the 24h clean-up at most every 15 minutes. Called from record_event and GET /stats.

    Never raises: a failed clean-up must not block an event from being recorded.
    """
    global _last_purge
    if time.monotonic() - _last_purge < PURGE_EVERY_SECONDS and _last_purge:
        return
    _last_purge = time.monotonic()
    try:
        purge_raw_login_data(db)
    except Exception:
        logger.exception("raw login data clean-up failed")
