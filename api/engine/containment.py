"""Containment state: locked accounts, revoked sessions, frozen agents. OWNER: Daylen (P3).

`entity_state` is what makes containment real: Login Guard asks is_locked() before letting a
login through, and the Agent Firewall asks is_frozen() before every tool call.

Disruptive changes here happen only from an APPROVED approval (engine.approvals) or from a
signed-in human pressing the kill switch / freeze. Nothing in this file is called by an AI.
"""

from __future__ import annotations

import logging

from engine.audit import write_audit
from engine.util import iso, now

logger = logging.getLogger("api.engine")

ALL_AGENTS = "*all-agents*"  # the kill switch row
ACCOUNT_LOCKED_MESSAGE = "account locked"
ACTIONS = ("lock_account", "revoke_sessions", "freeze_agent")


def _set(db, entity: str, by: str, **fields) -> dict:
    row = {"entity": entity, **fields, "updated_at": iso(now()), "updated_by": by}
    data = db.table("entity_state").upsert(row, on_conflict="entity").execute().data
    return data[0] if data else row


def _get(db, entity: str) -> dict | None:
    rows = db.table("entity_state").select("*").eq("entity", entity).limit(1).execute().data
    return rows[0] if rows else None


def lock_account(db, entity: str, *, by: str) -> dict:
    row = _set(db, entity, by, locked=True)
    write_audit(db, actor=by, action="account_locked", detail={"entity": entity})
    return row


def revoke_sessions(db, entity: str, *, by: str) -> dict:
    row = _set(db, entity, by, sessions_revoked_at=iso(now()))
    write_audit(db, actor=by, action="sessions_revoked", detail={"entity": entity})
    return row


def freeze_agent(db, agent_id: str, *, by: str) -> dict:
    row = _set(db, agent_id, by, frozen=True)
    write_audit(db, actor=by, action="agent_frozen", detail={"entity": agent_id})
    return row


def kill_switch(db, *, by: str) -> dict:
    """Freeze every AI agent at once. Stays on until the demo is reset."""
    row = _set(db, ALL_AGENTS, by, frozen=True)
    write_audit(db, actor=by, action="kill_switch_on", detail={})
    return row


def apply_action(db, action: dict, *, by: str) -> None:
    """Carry out one approved action: {"action": "lock_account", "entity": "j.smith"}."""
    kind, entity = action.get("action"), action.get("entity")
    if not entity or kind not in ACTIONS:
        raise ValueError(f"unknown containment action: {kind!r}")
    {"lock_account": lock_account, "revoke_sessions": revoke_sessions, "freeze_agent": freeze_agent}[kind](
        db, entity, by=by
    )


def is_locked(db, entity: str) -> bool:
    """Login Guard: is this account locked? If the lookup fails we do NOT lock a human out."""
    try:
        row = _get(db, entity)
    except Exception:
        logger.exception("is_locked lookup failed; treating account as not locked")
        return False
    return bool(row and row.get("locked"))


def is_frozen(db, agent_id: str) -> bool:
    """Agent Firewall: may this agent act? Kill switch counts. If the lookup fails, fail CLOSED."""
    try:
        rows = db.table("entity_state").select("entity,frozen").in_("entity", [agent_id, ALL_AGENTS]).execute().data
    except Exception:
        logger.exception("is_frozen lookup failed; treating agent as frozen")
        return True
    return any(r.get("frozen") for r in rows)
