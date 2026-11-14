"""Audience Attack Picker. OWNER: Miles (P2). PUBLIC: no login. TOP PRIORITY.

STUB in the final shape. TODO(Miles): capped settings, guest01..guest30 only, rate limited,
actor = judge:<nickname>, source = audience, sneaky = watched, loud = blocked.
"""

from __future__ import annotations

from fastapi import APIRouter

from schemas.kairos import PlaygroundLaunchRequest, PlaygroundLaunchResponse

router = APIRouter(prefix="/playground", tags=["playground"])


@router.post("/launch", response_model=PlaygroundLaunchResponse, summary="Launch an audience attack")
async def launch(body: PlaygroundLaunchRequest) -> PlaygroundLaunchResponse:
    return PlaygroundLaunchResponse(
        log_lines=[f"[stub] {body.nickname} launched {body.attack_type}"],
        outcome="stub: blocked",
        risk=72,
        response_level="blocked",
    )
