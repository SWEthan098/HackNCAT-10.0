"""Small in-memory rate limiter for the public Attack Picker. OWNER: Miles (P2).

Two sliding windows: one per device and one for everyone together. In memory on purpose: one
API process serves the demo, and a restart simply clears it.
"""

from __future__ import annotations

import math
import time
from collections import deque
from collections.abc import Callable


class RateLimiter:
    def __init__(
        self,
        *,
        per_key: int = 6,
        per_key_window: float = 20.0,
        global_limit: int = 60,
        global_window: float = 10.0,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.per_key, self.per_key_window = per_key, per_key_window
        self.global_limit, self.global_window = global_limit, global_window
        self._clock = clock
        self._by_key: dict[str, deque[float]] = {}
        self._all: deque[float] = deque()

    @staticmethod
    def _trim(hits: deque[float], cutoff: float) -> None:
        while hits and hits[0] <= cutoff:
            hits.popleft()

    def check(self, key: str) -> int:
        """Record one request. Returns 0 if allowed, otherwise the seconds to wait (not recorded)."""
        now = self._clock()
        mine = self._by_key.setdefault(key, deque())
        self._trim(mine, now - self.per_key_window)
        self._trim(self._all, now - self.global_window)
        if len(mine) >= self.per_key:
            return max(1, math.ceil(mine[0] + self.per_key_window - now))
        if len(self._all) >= self.global_limit:
            return max(1, math.ceil(self._all[0] + self.global_window - now))
        mine.append(now)
        self._all.append(now)
        if len(self._by_key) > 5000:  # forget idle devices so memory stays flat
            self._by_key = {k: v for k, v in self._by_key.items() if v}
        return 0

    def reset(self) -> None:
        self._by_key.clear()
        self._all.clear()
