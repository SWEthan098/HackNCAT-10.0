"""Login Guard + Comms Guard endpoints. OWNER: Miles (P2).

/sensors/login is public (the login page calls it before a session exists).
STUB responses in the final shape.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from auth import AuthUser, current_user
from detectors import classify_message, score_login
from schemas.kairos import LoginSignalRequest, MessageSignalRequest, SensorResponse

router = APIRouter(prefix="/sensors", tags=["sensors"])


@router.post("/login", response_model=SensorResponse, summary="Login Guard: score login behavior signals")
async def login_signal(body: LoginSignalRequest) -> SensorResponse:
    return SensorResponse(verdict="allowed", detection=score_login(body.features))


@router.post("/message", response_model=SensorResponse, summary="Comms Guard: score a message")
async def message_signal(body: MessageSignalRequest, _: AuthUser = Depends(current_user)) -> SensorResponse:
    return SensorResponse(verdict="allowed", detection=await classify_message(body.body))
