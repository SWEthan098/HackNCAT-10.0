"""Reset demo state between rehearsals. OWNER: Daylen (P3). red_team role only."""

from __future__ import annotations

from fastapi import APIRouter, Depends

import engine
from auth import AuthUser, require_role
from core.db import get_db
from schemas.kairos import OkResponse

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/reset", response_model=OkResponse, summary="Clear entity_state, incidents and test data")
def reset(user: AuthUser = Depends(require_role("red_team")), db=Depends(get_db)) -> OkResponse:
    """Clears incidents, events, approvals, appeals, audience data and all locks/freezes (kill switch
    included). The audit log is kept. Reload the seed data afterwards."""
    counts = engine.reset_demo(db, by=f"user:{user.id}")
    return OkResponse(detail=f"Demo reset: {sum(counts.values())} rows cleared")
