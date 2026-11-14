"""Scripted Red Team chain. OWNER: Miles (P2). Bearer auth (TODO: red_team role only).

STUB in the final shape. TODO(Miles): 3 stages, cisco.example sandbox only, source = scripted,
every run audit-logged.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from auth import AuthUser, current_user
from schemas.kairos import RedteamRunRequest, RedteamRunResponse

router = APIRouter(prefix="/redteam", tags=["redteam"])


@router.post("/run", response_model=RedteamRunResponse, summary="Run a Red Team stage or the full chain")
async def redteam_run(body: RedteamRunRequest, _: AuthUser = Depends(current_user)) -> RedteamRunResponse:
    return RedteamRunResponse(log_lines=[f"[stub] {body.stage} against {body.target} agent"], outcome="stub")
