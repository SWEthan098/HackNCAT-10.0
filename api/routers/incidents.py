"""Incidents. OWNER: Daylen (P3). Bearer auth. Real incidents from the database."""

from __future__ import annotations

from fastapi import APIRouter, Depends

import engine
from auth import AuthUser, current_user
from core.db import get_db
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


@router.post("/{incident_id}/false-positive", response_model=Incident, summary="Mark an incident as a false positive")
def mark_false_positive(
    incident_id: str, body: FalsePositiveRequest, user: AuthUser = Depends(current_user), db=Depends(get_db)
) -> Incident:
    return engine.mark_false_positive(db, incident_id, reason=body.reason, user_id=user.id)
