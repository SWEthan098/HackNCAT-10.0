"""Human approvals. OWNER: Daylen (P3). Bearer auth (TODO: approver role, still pending, audit log)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from auth import AuthUser, current_user
from schemas.kairos import Approval

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _stub(approval_id: str, status: str, user: AuthUser) -> Approval:
    now = datetime.now(UTC)
    return Approval(
        id=approval_id,
        incident_id="inc-demo",
        status=status,
        summary="stub approval",
        decided_by=user.id,
        decided_at=now,
        created_at=now,
    )


@router.post("/{approval_id}/approve", response_model=Approval, summary="Approve containment")
def approve(approval_id: str, user: AuthUser = Depends(current_user)) -> Approval:
    return _stub(approval_id, "approved", user)


@router.post("/{approval_id}/deny", response_model=Approval, summary="Deny containment")
def deny(approval_id: str, user: AuthUser = Depends(current_user)) -> Approval:
    return _stub(approval_id, "denied", user)
