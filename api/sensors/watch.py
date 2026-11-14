"""Accounts "under watch": not trusted right now, but not locked. OWNER: Miles (P2).

Between "fully trusted" and "locked by a human" there used to be nothing, so an attacker who got
in with a guessed password kept a trusted account until someone approved containment. Now:

    Login Guard sees a sign-in succeed right after repeated failures
        -> the account (and the source that got in) go under watch, automatically
    Comms Guard: a flagged message from a watched account is HELD for verification
    Login Guard: the watched source trying any OTHER account is challenged straight away

Under watch is automatic, instant and reversible. It never locks anyone out: the account keeps
working for ordinary things, and only risky actions wait for verification. Locking the account
is still a human decision (approval). It is a fixed rule, separate from the risk score, so it
does not change any event's score or the incident math.

Entries are kept per source, and for audience attacks per judge, so one judge's takeover never
affects another judge or the scripted chain. In memory (one API process), no personal data;
cleared by `reset()` (Reset demo) or `clear()` once a person has decided.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from schemas.kairos import Source

MAX_ENTRIES = 2000
REASON_TAKEOVER = "a sign-in succeeded right after repeated failures"


@dataclass(frozen=True)
class WatchEntry:
    entity: str  # the account, or the source that took it over
    source: Source
    by: str  # the actor whose activity caused the watch (bot:..., judge:<nickname>)
    reason: str
    since: datetime
    accounts: frozenset[str] = frozenset()  # for a watched source: the accounts it already got into


_watched: dict[tuple[str, str, str], WatchEntry] = {}


def _key(entity: str, source: Source, by: str) -> tuple[str, str, str]:
    return (source, by, entity)


def watch_takeover(account: str, *, source: Source, by: str, reason: str = REASON_TAKEOVER) -> WatchEntry:
    """Put `account` under watch, and remember that the source `by` got into it."""
    now = datetime.now(UTC)
    if len(_watched) >= MAX_ENTRIES:
        _watched.pop(next(iter(_watched)))
    entry = _watched.get(_key(account, source, by)) or WatchEntry(account, source, by, reason, now)
    _watched[_key(account, source, by)] = entry
    previous = _watched.get(_key(by, source, by))
    already = previous.accounts if previous else frozenset()
    _watched[_key(by, source, by)] = WatchEntry(
        by, source, by, reason, previous.since if previous else now, already | {account}
    )
    return entry


def watched_account(account: str, *, source: Source, actor: str) -> WatchEntry | None:
    """The watch entry that applies to `account` when `actor` is acting, if any.

    Scripted: any takeover of the account counts (the account itself is the next actor).
    Audience: only the same judge's takeover counts, so judges never affect each other.
    """
    for (entry_source, by, entity), entry in _watched.items():
        if entity != account or entry_source != source or entity == by:
            continue
        if source == "scripted" or by == actor:
            return entry
    return None


def watched_source(actor: str, *, source: Source) -> WatchEntry | None:
    """The entry for a source that already took over an account, if any."""
    return _watched.get(_key(actor, source, actor))


def clear(account: str) -> int:
    """A person decided (contained it or cleared it): stop watching this account. Returns how many entries went."""
    gone = [k for k in _watched if k[2] == account]
    for k in gone:
        del _watched[k]
    return len(gone)


def watched() -> list[WatchEntry]:
    return list(_watched.values())


def reset() -> None:
    _watched.clear()
