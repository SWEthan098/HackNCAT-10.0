"""The firewall's only touch points with teammates' code. OWNER: Ethan (P1).

- Events: engine.record_event() (Daylen) is the ONLY way events are written.
- Containment state: the `entity_state` table (read only; the firewall never locks or freezes).
- Approvals: engine.create_approval() when Daylen ships it.

Every adapter fails SAFE: a recording failure never turns a block into an allow, and unknown
containment state is reported as unknown so the caller can hold sensitive actions.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import engine
from schemas.kairos import Event, MitreTag, Source, Verdict

logger = logging.getLogger("api.firewall")

SENSOR = "agent_firewall"
# Rows Daylen's kill switch may use to freeze every agent at once.
GLOBAL_FREEZE_ENTITIES = ("*", "all_agents", "killswitch")


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
) -> Event | None:
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

    def __init__(self, db: Any | None):
        self.db = db

    def get(self, entity: str) -> EntityState | None:
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


def request_approval(event: Event | None, summary: str) -> str | None:
    """Ask Daylen's engine for a pending approval on the event's incident. Returns the approval id.

    `summary` must be built from code templates (never attacker text) so the approver can't be fooled.
    """
    create = getattr(engine, "create_approval", None)
    if not callable(create) or event is None or not event.incident_id:
        return None
    try:
        approval = create(incident_id=event.incident_id, summary=summary)
    except Exception as e:
        logger.error("firewall: create_approval failed (%s)", type(e).__name__)
        return None
    return getattr(approval, "id", None) or (approval.get("id") if isinstance(approval, dict) else None)
