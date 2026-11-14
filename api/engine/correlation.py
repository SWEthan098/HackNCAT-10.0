"""Correlation: link related events into incidents. OWNER: Daylen (P3).

record_event() calls correlate() after every insert.
"""

from __future__ import annotations

from schemas.kairos import Event


def correlate(db, event: Event) -> str | None:
    """Return the incident id this event now belongs to, or None.

    TODO(Daylen, step 7): link by same actor OR takeover chain, same source only, never by a
    shared target alone; open an incident when 2+ listeners link.
    """
    return None
