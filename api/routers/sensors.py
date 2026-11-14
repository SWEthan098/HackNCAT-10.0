"""Login Guard + Comms Guard endpoints. OWNER: Miles (P2).

/sensors/login is public (the login page calls it before a session exists).
Both are real: sensors/login_guard.py and sensors/comms_guard.py.
"""

from __future__ import annotations

import hashlib
import logging

from fastapi import APIRouter, Depends, Request

from auth import AuthUser, current_user
from core.db import get_db
from core.errors import AppError
from detectors.login import FEATURE_KEYS
from schemas.kairos import LoginSignalRequest, MessageSignalRequest, SensorResponse
from sensors.comms_guard import handle_message
from sensors.login_guard import handle_login

router = APIRouter(prefix="/sensors", tags=["sensors"])
logger = logging.getLogger("api.sensors")


def _login_db(request: Request):
    """The database, or None when it is not configured (Login Guard then scores without lock checks)."""
    provider = request.app.dependency_overrides.get(get_db, get_db)
    try:
        return provider()
    except AppError:
        return None


def _source_id(request: Request) -> str:
    """A short one-way label for where the attempt came from. The address itself is never stored."""
    host = request.client.host if request.client else "unknown"
    return "client:" + hashlib.sha256(f"kairos-login-guard:{host}".encode()).hexdigest()[:10]


@router.post("/login", response_model=SensorResponse, summary="Login Guard: score login behavior signals")
def login_signal(body: LoginSignalRequest, request: Request, db=Depends(_login_db)) -> SensorResponse:
    """Timing/metadata only. Unknown feature keys are dropped; typed content is never read or stored."""
    result = handle_login(
        body.username, body.features, actor=_source_id(request), source="audience", db=db, record_low=False
    )
    # Key names and the outcome only: never the username, the values or anything typed.
    known = sorted(k for k in body.features if k in FEATURE_KEYS)
    logger.info(
        "login signal keys=%s ignored_keys=%d risk=%d response=%s",
        ",".join(known) or "none",
        len(body.features) - len(known),
        result.risk,
        result.response,
    )
    return SensorResponse(verdict=result.verdict, detection=result.detection)


@router.post("/message", response_model=SensorResponse, summary="Comms Guard: score a message")
async def message_signal(
    body: MessageSignalRequest, _: AuthUser = Depends(current_user), db=Depends(_login_db)
) -> SensorResponse:
    result = await handle_message(sender=body.sender, to=body.to, body=body.body, source="scripted", db=db)
    return SensorResponse(verdict=result.verdict, detection=result.detection)
