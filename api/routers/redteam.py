"""Scripted Red Team chain. OWNER: Miles (P2). Bearer auth.

Runs the 3-stage chain in redteam/chain.py. The target is hardcoded to the fictional
cisco.example sandbox: the request can only pick a stage and protected / unprotected.
Every run is written to the server log. TODO(Miles, step 9): red_team role only (ready, lands with
Daylen's test update) + audit_log entry per run (needs Daylen's helper).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request

from auth import AuthUser, current_user
from core.db import get_db
from core.errors import AppError
from redteam import chain
from schemas.kairos import RedteamRunRequest, RedteamRunResponse

router = APIRouter(prefix="/redteam", tags=["redteam"])
logger = logging.getLogger("api.redteam")


def _db(request: Request):
    """The database, or None when it is not configured (the chain then skips lock checks)."""
    provider = request.app.dependency_overrides.get(get_db, get_db)
    try:
        return provider()
    except AppError:
        return None


@router.post("/run", response_model=RedteamRunResponse, summary="Run a Red Team stage or the full chain")
async def redteam_run(
    body: RedteamRunRequest, user: AuthUser = Depends(current_user), db=Depends(_db)
) -> RedteamRunResponse:
    logger.info("redteam run user=%s stage=%s target=%s sandbox=cisco.example", user.id, body.stage, body.target)
    result = await chain.run(body.stage, body.target, db=db)
    return RedteamRunResponse(log_lines=result.log_lines, outcome=result.outcome)
