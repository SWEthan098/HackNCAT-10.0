"""Reset demo state between rehearsals. OWNER: Daylen (P3). TODO: red_team role only."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from auth import AuthUser, current_user
from schemas.kairos import OkResponse

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/reset", response_model=OkResponse, summary="Clear entity_state, incidents and test data")
def reset(_: AuthUser = Depends(current_user)) -> OkResponse:
    return OkResponse(detail="stub: demo reset")
