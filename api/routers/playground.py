"""Audience Attack Picker. OWNER: Miles (P2). PUBLIC: no login. TOP PRIORITY.

Runs redteam/playground.py: capped settings, guest01..guest30 only, actor = judge:<nickname>,
source = audience, sneaky = watched, loud = blocked. Rate limited per device and globally.
"""

from __future__ import annotations

import hashlib

from fastapi import APIRouter, Depends, Request

from core.db import get_db
from core.errors import AppError
from redteam import playground
from redteam.ratelimit import RateLimiter
from schemas.kairos import PlaygroundLaunchRequest, PlaygroundLaunchResponse

router = APIRouter(prefix="/playground", tags=["playground"])

limiter = RateLimiter(per_key=6, per_key_window=20.0, global_limit=60, global_window=10.0)


def _db(request: Request):
    """The database, or None when it is not configured (attacks then run without lock checks)."""
    provider = request.app.dependency_overrides.get(get_db, get_db)
    try:
        return provider()
    except AppError:
        return None


def _device(request: Request, nickname: str) -> str:
    """One-way label for one visitor: network address + codename. Neither is stored or logged.

    The codename is part of the key because a whole room on the same Wi-Fi shares one address;
    keyed by address alone, thirty judges would share one visitor's allowance.
    """
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    host = forwarded or (request.client.host if request.client else "unknown")
    who = playground.clean_nickname(nickname)
    return hashlib.sha256(f"kairos-playground:{host}:{who}".encode()).hexdigest()[:16]


@router.post("/launch", response_model=PlaygroundLaunchResponse, summary="Launch an audience attack")
async def launch(body: PlaygroundLaunchRequest, request: Request, db=Depends(_db)) -> PlaygroundLaunchResponse:
    wait = limiter.check(_device(request, body.nickname))
    if wait:
        raise AppError(429, "rate_limited", f"The defenders are busy, retry in {wait}s")
    result = await playground.launch(body.attack_type, body.settings, body.nickname, db=db, request=request)
    return PlaygroundLaunchResponse(
        log_lines=result.log_lines,
        outcome=result.outcome,
        risk=result.risk,
        response_level=result.response_level,
    )
