"""Appeals (minimal: no separate screen). OWNER: Daylen (P3).

POST is public so a blocked judge can appeal from /attack. GET needs auth.
"""

from __future__ import annotations

import time
from collections import deque

from fastapi import APIRouter, Depends, Request

import engine
from auth import AuthUser, current_user
from core.db import get_db
from core.errors import AppError
from schemas.kairos import Appeal, AppealRequest

router = APIRouter(prefix="/appeals", tags=["appeals"])

# The one public endpoint that writes free text: keep it from being used to flood the table.
PER_CLIENT_PER_MINUTE = 5
GLOBAL_PER_MINUTE = 120
_hits: dict[str, deque[float]] = {}
_all: deque[float] = deque()


def _allow(client: str) -> bool:
    cutoff = time.monotonic() - 60
    mine = _hits.setdefault(client, deque())
    for window in (mine, _all):
        while window and window[0] < cutoff:
            window.popleft()
    if len(mine) >= PER_CLIENT_PER_MINUTE or len(_all) >= GLOBAL_PER_MINUTE:
        return False
    mine.append(time.monotonic())
    _all.append(time.monotonic())
    if len(_hits) > 5000:  # forget idle clients
        for key in [k for k, v in _hits.items() if not v]:
            del _hits[key]
    return True


def _client(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


@router.post("", response_model=Appeal, summary="File an appeal against a block")
def create_appeal(body: AppealRequest, request: Request, db=Depends(get_db)) -> Appeal:
    if not _allow(_client(request)):
        raise AppError(429, "rate_limited", "Too many appeals. Try again in a minute.")
    return engine.create_appeal(db, reason=body.reason, event_id=body.event_id, incident_id=body.incident_id)


@router.get("", response_model=list[Appeal], summary="List appeals (newest first)")
def list_appeals(
    incident_id: str | None = None, _: AuthUser = Depends(current_user), db=Depends(get_db)
) -> list[Appeal]:
    return engine.list_appeals(db, incident_id=incident_id)
