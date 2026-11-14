"""Kill switch + per-agent freeze. OWNER: Daylen (P3). Analyst or approver role; every use is audited."""

from __future__ import annotations

from fastapi import APIRouter, Depends

import engine
from auth import AuthUser
from core.db import get_db
from core.roles import DEFENDER_ROLES, require_any_role
from engine.util import safe_name
from schemas.kairos import OkResponse

router = APIRouter(tags=["agents"])


@router.post("/killswitch", response_model=OkResponse, summary="Freeze every AI agent")
def killswitch(user: AuthUser = Depends(require_any_role(*DEFENDER_ROLES)), db=Depends(get_db)) -> OkResponse:
    """Stays on until the demo is reset. The Agent Firewall refuses every tool call while it is on."""
    engine.kill_switch(db, by=f"user:{user.id}")
    return OkResponse(detail="All agents frozen")


@router.post("/agents/{agent_id}/freeze", response_model=OkResponse, summary="Freeze one agent")
def freeze(
    agent_id: str, user: AuthUser = Depends(require_any_role(*DEFENDER_ROLES)), db=Depends(get_db)
) -> OkResponse:
    agent = safe_name(agent_id)
    engine.freeze_agent(db, agent, by=f"user:{user.id}")
    return OkResponse(detail=f"{agent} frozen")
