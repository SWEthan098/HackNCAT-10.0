"""The firewall's only touch points with teammates' code. OWNER: Ethan (P1).

- Events: engine.record_event() (Daylen) is the ONLY way events are written.
- Containment state: the `entity_state` table (read only; the firewall never locks or freezes).
- Approvals: engine.create_approval() when Daylen ships it.

Every adapter fails SAFE: a recording failure never turns a block into an allow, and unknown
containment state is reported as unknown so the caller can hold sensitive actions.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

import engine
from schemas.kairos import Event, MitreTag, Source, Verdict

logger = logging.getLogger("api.firewall")

SENSOR = "agent_firewall"
# Rows Daylen's kill switch may use to freeze every agent at once.
try:  # Daylen's kill switch row; fall back to the literal if the engine module moves
    from engine.containment import ALL_AGENTS as _KILL_SWITCH_ROW
except ImportError:  # pragma: no cover
    _KILL_SWITCH_ROW = "*all-agents*"
GLOBAL_FREEZE_ENTITIES = (_KILL_SWITCH_ROW, "*", "all_agents", "killswitch")


def record(
    *,
    actor: str,
    target: str,
    source: Source,
    action: str,
    risk: int,
    verdict: Verdict,
    reason: str,
    mitre: list[MitreTag] | None = None,
    db: Any | None = None,
) -> Event | None:
    """Blocking (it writes to the database): the firewall calls it from a worker thread."""
    try:
        return engine.record_event(
            sensor=SENSOR,
            actor=actor,
            target=target,
            source=source,
            action=action,
            risk=max(0, min(100, int(risk))),
            verdict=verdict,
            reason=reason,
            mitre=mitre or [],
            **({"db": db} if db is not None else {}),
        )
    except Exception as e:  # never let logging failures change a decision
        logger.error("firewall: record_event failed (%s)", type(e).__name__)
        return None


@dataclass(frozen=True)
class EntityState:
    entity: str
    locked: bool = False
    frozen: bool = False


class EntityStateReader:
    """Reads containment state. `db` is a supabase-py client (or the test fake); None = unknown."""

    CACHE_SECONDS = 2.0  # one task makes several checks; a freeze still applies within ~2s

    def __init__(self, db: Any | None):
        self.db = db
        self._cache: dict[str, tuple[float, EntityState | None]] = {}

    def get(self, entity: str) -> EntityState | None:
        hit = self._cache.get(entity)
        now = time.monotonic()
        if hit and now - hit[0] < self.CACHE_SECONDS:
            return hit[1]
        state = self._lookup(entity)
        self._cache[entity] = (now, state)
        return state

    def _lookup(self, entity: str) -> EntityState | None:
        getter = getattr(engine, "get_entity_state", None)
        try:
            if callable(getter):
                row = getter(entity)
                if row is None:
                    return EntityState(entity)
                data = row if isinstance(row, dict) else row.model_dump()
                return EntityState(entity, bool(data.get("locked")), bool(data.get("frozen")))
            if self.db is None:
                return None
            rows = self.db.table("entity_state").select("entity,locked,frozen").eq("entity", entity).execute().data
        except Exception as e:
            logger.warning("firewall: entity_state lookup failed for %s (%s)", entity, type(e).__name__)
            return None
        if not rows:
            return EntityState(entity)
        return EntityState(entity, bool(rows[0].get("locked")), bool(rows[0].get("frozen")))

    def prefetch(self, entities: list[str]) -> None:
        """Load several entities in ONE query into the cache (blocking: call it via a worker thread)."""
        now = time.monotonic()
        wanted = [e for e in entities if not (e in self._cache and now - self._cache[e][0] < self.CACHE_SECONDS)]
        if not wanted or self.db is None or callable(getattr(engine, "get_entity_state", None)):
            return
        try:
            query = self.db.table("entity_state").select("entity,locked,frozen")
            if not hasattr(query, "in_"):
                return  # a client without in_(): fall back to per-entity lookups
            rows = query.in_("entity", wanted).execute().data or []
        except Exception as e:
            logger.warning("firewall: entity_state prefetch failed (%s)", type(e).__name__)
            for entity in wanted:
                self._cache[entity] = (now, None)
            return
        found = {r.get("entity"): r for r in rows}
        for entity in wanted:
            r = found.get(entity) or {}
            self._cache[entity] = (now, EntityState(entity, bool(r.get("locked")), bool(r.get("frozen"))))

    def agent_frozen(self, agent: str) -> bool | None:
        states = [self.get(e) for e in (agent, *GLOBAL_FREEZE_ENTITIES)]
        if any(s is not None and s.frozen for s in states):
            return True
        if states[0] is None:
            return None
        return False

    def actor_locked(self, actor: str) -> bool | None:
        state = self.get(actor)
        return None if state is None else state.locked


class StaticEntityState(EntityStateReader):
    """Fixed state for tests and offline runs."""

    def __init__(self, frozen: set[str] | None = None, locked: set[str] | None = None, unknown: bool = False):
        super().__init__(None)
        self.frozen, self.locked, self.unknown = frozen or set(), locked or set(), unknown

    def get(self, entity: str) -> EntityState | None:
        if self.unknown:
            return None
        return EntityState(entity, entity in self.locked, entity in self.frozen)


def request_approval(db: Any | None, event: Event | None, *, requested_by: str = "agent_firewall") -> str | None:
    """Ask Daylen's engine for a pending approval on the event's incident. Returns the approval id.

    The engine writes the approval text from code templates (never attacker text), and returns the
    already-pending approval if one exists, so calling this twice is safe.
    """
    create = getattr(engine, "create_approval", None)
    if not callable(create) or db is None or event is None or not event.incident_id:
        return None
    try:
        approval = create(db, event.incident_id, requested_by=requested_by)
    except Exception as e:
        logger.error("firewall: create_approval failed (%s)", type(e).__name__)
        return None
    return getattr(approval, "id", None) or (approval.get("id") if isinstance(approval, dict) else None)
