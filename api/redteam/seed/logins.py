"""Normal login history: the baseline Login Guard compares against. OWNER: Miles (P2).

Timing and metadata only, never anything a person typed. Generated from a fixed seed so every
run produces the same history. Kept in memory on purpose: it is a baseline, not a stream of
events, so it never shows up in the console or links into incidents.
"""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

from redteam.seed.company import EMPLOYEES

LOGINS_PER_EMPLOYEE = 12
_BASE = datetime(2026, 11, 2, 0, 0, tzinfo=UTC)

# The feature names Login Guard scores (score_login). All are counts or timings.
FEATURE_KEYS: tuple[str, ...] = (
    "failed_attempts",
    "attempts_per_minute",
    "avg_keystroke_interval_ms",
    "keystroke_interval_stddev_ms",
    "accounts_from_source",
    "success_after_failures",
)


@lru_cache
def normal_login_history() -> tuple[dict[str, Any], ...]:
    rng = random.Random(1113)
    history: list[dict[str, Any]] = []
    for employee in EMPLOYEES:
        for n in range(LOGINS_PER_EMPLOYEE):
            failed = 1 if rng.random() < 0.15 else 0  # people mistype now and then
            history.append(
                {
                    "username": employee.username,
                    "at": (_BASE + timedelta(days=n, hours=8, minutes=rng.randint(0, 90))).isoformat(),
                    "features": {
                        "failed_attempts": failed,
                        "attempts_per_minute": 1 + failed,
                        "avg_keystroke_interval_ms": rng.randint(140, 320),
                        "keystroke_interval_stddev_ms": rng.randint(45, 120),
                        "accounts_from_source": 1,
                        "success_after_failures": False,
                    },
                }
            )
    return tuple(history)
