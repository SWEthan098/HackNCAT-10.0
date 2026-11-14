"""Audience attack endpoint (QR landing page). OWNER: Ethan (P1). PUBLIC: no login.

STUB: returns a fixed blocked result in the final response shape.
TODO(Ethan): run through the firewall, per-device + global rate limits (slowapi), breach flag,
actor = judge:<nickname>, source = audience, honest offline state if the model is unreachable.
"""

from __future__ import annotations

from fastapi import APIRouter

from schemas.kairos import AttackRequest, AttackResponse, LayerResult
from schemas.mitre import tag

router = APIRouter(tags=["attack"])


@router.post("/attack", response_model=AttackResponse, summary="Audience attack against the protected agent")
async def attack(body: AttackRequest) -> AttackResponse:
    return AttackResponse(
        verdict="blocked",
        blocked_by="scope_policy",
        reason="stub: this task only allowed reading, so sending was blocked",
        layers=[
            LayerResult(name="injection_scan", status="passed"),
            LayerResult(name="intent_check", status="passed"),
            LayerResult(name="scope_policy", status="blocked"),
            LayerResult(name="taint_tracking", status="skipped"),
            LayerResult(name="leak_protection", status="skipped"),
        ],
        technique=tag("prompt_injection_direct") if body.delivery == "direct" else tag("prompt_injection_indirect"),
        breach=False,
    )
