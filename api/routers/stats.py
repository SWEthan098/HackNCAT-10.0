"""Scoreboard / KPI strip numbers. OWNER: Daylen (P3). STUB."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from auth import AuthUser, current_user
from schemas.kairos import Stats

router = APIRouter(tags=["stats"])


@router.get("/stats", response_model=Stats, summary="KPI numbers")
def stats(_: AuthUser = Depends(current_user)) -> Stats:
    return Stats(
        attacks_blocked=0,
        breaches=0,
        false_positives=0,
        avg_decision_ms=0.0,
        open_incidents={"low": 0, "medium": 0, "high": 0, "critical": 1},
    )
