"""Kill switch + per-agent freeze. OWNER: Daylen (P3). Every use is audited.

Stopping things needs the analyst or approver role: fast, and safe to do. Turning the kill
switch off needs the approver role. Unlocking accounts and unfreezing agents an incident held
goes through an approval: POST /incidents/{id}/release.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

import engine
from auth import AuthUser, require_role
from core.db import get_db
from core.roles import DEFENDER_ROLES, require_any_role
from engine.util import safe_name
from schemas.kairos import OkResponse

router = APIRouter(tags=["agents"])


@router.post("/killswitch", response_model=OkResponse, summary="Freeze every AI agent")
def killswitch(user: AuthUser = Depends(require_any_role(*DEFENDER_ROLES)), db=Depends(get_db)) -> OkResponse:
    """Stays on until an approver turns it off (POST /killswitch/off) or the demo is reset."""
    engine.kill_switch(db, by=f"user:{user.id}")
    return OkResponse(detail="All agents frozen")


@router.post("/killswitch/off", response_model=OkResponse, summary="Turn the kill switch off (approver)")
def killswitch_off(user: AuthUser = Depends(require_role("approver")), db=Depends(get_db)) -> OkResponse:
    """Agents frozen one by one stay frozen."""
    engine.kill_switch_off(db, by=f"user:{user.id}")
    return OkResponse(detail="Kill switch off")


@router.post("/agents/{agent_id}/freeze", response_model=OkResponse, summary="Freeze one agent")
def freeze(
    agent_id: str, user: AuthUser = Depends(require_any_role(*DEFENDER_ROLES)), db=Depends(get_db)
) -> OkResponse:
    agent = safe_name(agent_id)
    engine.freeze_agent(db, agent, by=f"user:{user.id}")
    return OkResponse(detail=f"{agent} frozen")
