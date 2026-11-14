"""Kill switch + per-agent freeze. OWNER: Daylen (P3). STUB."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from auth import AuthUser, current_user
from schemas.kairos import OkResponse

router = APIRouter(tags=["agents"])


@router.post("/killswitch", response_model=OkResponse, summary="Freeze every AI agent")
def killswitch(_: AuthUser = Depends(current_user)) -> OkResponse:
    return OkResponse(detail="stub: all agents frozen")


@router.post("/agents/{agent_id}/freeze", response_model=OkResponse, summary="Freeze one agent")
def freeze(agent_id: str, _: AuthUser = Depends(current_user)) -> OkResponse:
    return OkResponse(detail=f"stub: {agent_id} frozen")
