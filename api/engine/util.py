"""Small shared helpers for the engine. OWNER: Daylen (P3)."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

_UNSAFE = re.compile(r"[^A-Za-z0-9._:@-]")


def now() -> datetime:
    return datetime.now(UTC)


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).isoformat()


def parse_ts(value) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def is_uuid(value: str) -> bool:
    try:
        uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return False
    return True


def safe_name(value: str, max_len: int = 60) -> str:
    """An account/agent/actor id made safe to put in titles and approval text.

    Names can be chosen by an attacker (audience nicknames), so anything that is not a plain
    identifier character is dropped. This is what keeps attacker text out of approval messages.
    """
    cleaned = _UNSAFE.sub("", str(value))[:max_len]
    return cleaned or "unknown"


def involves(events: list[dict], identities) -> bool:
    """True if any of `identities` (lowercase names) is an actor or target in these events."""
    ids = {i.lower() for i in identities if i}
    return bool(ids) and any(str(e.get(field) or "").lower() in ids for e in events for field in ("actor", "target"))


def unique(items) -> list:
    """De-duplicate, keeping first-seen order."""
    return list(dict.fromkeys(items))
