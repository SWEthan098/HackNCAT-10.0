"""Human approvals. OWNER: Daylen (P3). Approver role only.

Checked on every call: valid login, `approver` role, approval still pending and not timed out.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

import engine
from auth import AuthUser, require_role
from core.db import get_db
from core.errors import AppError
from core.roles import user_identities
from engine.util import is_uuid
from schemas.kairos import Approval

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _decide(db, approval_id: str, user: AuthUser, approve: bool) -> Approval:
    if not is_uuid(approval_id):
        raise AppError(404, "approval_not_found", "No approval with that id")
    return Approval(
        **engine.decide_approval(db, approval_id, user_id=user.id, approve=approve, identities=user_identities(user))
    )


@router.post("/{approval_id}/approve", response_model=Approval, summary="Approve containment or a false positive")
def approve(approval_id: str, user: AuthUser = Depends(require_role("approver")), db=Depends(get_db)) -> Approval:
    """Containment: carries out the listed actions (lock, revoke, freeze), incident contained.
    False positive: closes the incident; refused for the person who asked or anyone in its events."""
    return _decide(db, approval_id, user, True)


@router.post("/{approval_id}/deny", response_model=Approval, summary="Deny containment")
def deny(approval_id: str, user: AuthUser = Depends(require_role("approver")), db=Depends(get_db)) -> Approval:
    """Nothing is locked; the incident goes back to the analyst."""
    return _decide(db, approval_id, user, False)
