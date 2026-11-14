"""Tamper-evident audit log. OWNER: Daylen (P3)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

import engine
from auth import AuthUser, current_user
from core.db import get_db
from schemas.kairos import AuditVerifyResponse

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/verify", response_model=AuditVerifyResponse, summary="Recheck the audit log hash chain")
def verify(_: AuthUser = Depends(current_user), db=Depends(get_db)) -> AuditVerifyResponse:
    """ok=false means a row was edited or removed; first_bad_entry is the audit row id to look at."""
    return engine.verify_audit(db)
