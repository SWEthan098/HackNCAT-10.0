"""Appeals (minimal: no separate screen). OWNER: Daylen (P3).

POST is public so a blocked judge can appeal from /attack. GET needs auth.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from auth import AuthUser, current_user
from schemas.kairos import Appeal, AppealRequest

router = APIRouter(prefix="/appeals", tags=["appeals"])


@router.post("", response_model=Appeal, summary="File an appeal against a block")
def create_appeal(body: AppealRequest) -> Appeal:
    return Appeal(id=str(uuid.uuid4()), created_at=datetime.now(UTC), **body.model_dump())


@router.get("", response_model=list[Appeal], summary="List appeals")
def list_appeals(_: AuthUser = Depends(current_user)) -> list[Appeal]:
    return []
