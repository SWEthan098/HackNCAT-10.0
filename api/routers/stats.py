"""KPI strip numbers. OWNER: Daylen (P3). Counted from the database on every call."""

from __future__ import annotations

from fastapi import APIRouter, Depends

import engine
from auth import AuthUser, current_user
from core.db import get_db
from engine.feed import maybe_purge
from schemas.kairos import Stats

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=Stats, summary="KPI numbers")
def stats(_: AuthUser = Depends(current_user), db=Depends(get_db)) -> Stats:
    engine.expire_stale_approvals(db)  # timed-out approvals close even if nobody taps them
    maybe_purge(db)  # 24h clean-up of raw login data
    return engine.get_stats(db)
