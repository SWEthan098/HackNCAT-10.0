"""Incidents. OWNER: Daylen (P3). Bearer auth. Real incidents from the database."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

import engine
from auth import AuthUser, current_user
from core.db import get_db
from core.roles import DEFENDER_ROLES, require_any_role, user_identities
from schemas.kairos import Approval, FalsePositiveRequest, Incident, IncidentDetail, Source

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("", response_model=list[Incident], summary="List incidents (highest risk first)")
def list_incidents(
    source: Source | None = None, _: AuthUser = Depends(current_user), db=Depends(get_db)
) -> list[Incident]:
    """Optional `?source=scripted` or `?source=audience` (the projector's audience view)."""
    return engine.list_incidents(db, source=source)


@router.get("/{incident_id}", response_model=IncidentDetail, summary="Incident with its linked events")
def get_incident(incident_id: str, _: AuthUser = Depends(current_user), db=Depends(get_db)) -> IncidentDetail:
    """Events are oldest first; `mitre` is the roll-up in kill-chain order."""
    return engine.get_incident(db, incident_id)


@router.post(
    "/{incident_id}/containment",
    response_model=Approval,
    summary="Request containment: creates a pending approval for a human to decide",
)
def request_containment(incident_id: str, user: AuthUser = Depends(current_user), db=Depends(get_db)) -> Approval:
    """Never locks anything by itself; it only asks an approver. Asking twice returns the same approval."""
    engine.get_incident(db, incident_id)  # 404 for unknown or malformed ids
    return Approval(**engine.create_approval(db, incident_id, requested_by=f"user:{user.id}"))


@router.post(
    "/{incident_id}/release",
    response_model=Approval,
    summary="Request lifting containment: creates a pending approval for a human to decide",
)
def request_release(
    incident_id: str, user: AuthUser = Depends(require_any_role(*DEFENDER_ROLES)), db=Depends(get_db)
) -> Approval:
    """Analyst or approver role. Only for a contained incident; unlocks nothing by itself.

    The approval lists what is still locked or frozen ("Unlock j.smith and unfreeze
    finance_agent?"). A different person must approve it on the phone. Asking twice returns the
    same approval. 409 if the incident isn't contained or nothing is still held; 403 if you
    appear in the incident.
    """
    engine.get_incident(db, incident_id)  # 404 for unknown or malformed ids
    return Approval(
        **engine.request_release(db, incident_id, requested_by=f"user:{user.id}", identities=user_identities(user))
    )


@router.post(
    "/{incident_id}/false-positive",
    response_model=Incident,
    summary="Mark an incident as a false positive (High/Critical: an approver confirms first)",
    responses={202: {"model": Incident, "description": "High/Critical: waiting for an approver to confirm"}},
)
def mark_false_positive(
    incident_id: str,
    body: FalsePositiveRequest,
    response: Response,
    user: AuthUser = Depends(require_any_role(*DEFENDER_ROLES)),
    db=Depends(get_db),
) -> Incident:
    """Analyst or approver role. Refused (403) if you appear in the incident's events.

    Low/Medium: 200, closed as a false positive. High/Critical: 202, the incident is returned
    unchanged and a confirmation request goes to the approver's phone; a different person
    must approve it. Pending containment stays tappable until then.
    """
    incident, approval = engine.mark_false_positive(
        db, incident_id, reason=body.reason, user_id=user.id, identities=user_identities(user)
    )
    if approval is not None:
        response.status_code = 202
    return incident
