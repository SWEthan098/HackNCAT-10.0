"""Tamper-evident audit log. OWNER: Daylen (P3). STUB."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from auth import AuthUser, current_user
from schemas.kairos import AuditVerifyResponse

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/verify", response_model=AuditVerifyResponse, summary="Recheck the audit log hash chain")
def verify(_: AuthUser = Depends(current_user)) -> AuditVerifyResponse:
    return AuditVerifyResponse(ok=True, entries_checked=0)
