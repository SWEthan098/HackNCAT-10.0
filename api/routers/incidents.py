"""Incidents. OWNER: Daylen (P3). Bearer auth. STUB: one fixed demo incident."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from auth import AuthUser, current_user
from core.errors import AppError
from engine import incident_risk, score_to_level
from schemas.kairos import Approval, Event, FalsePositiveRequest, Incident, IncidentDetail
from schemas.mitre import tag

router = APIRouter(prefix="/incidents", tags=["incidents"])

_NOW = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)
_EVENTS = [
    Event(
        id="evt-1",
        created_at=_NOW,
        sensor="login_guard",
        actor="bot:203.0.113.7",
        target="j.smith",
        source="scripted",
        action="credential stuffing, then login success",
        risk=45,
        level="medium",
        verdict="flagged",
        reason="143 fast failures then a success",
        mitre=[tag("credential_stuffing"), tag("valid_accounts")],
        incident_id="inc-demo",
    ),
    Event(
        id="evt-2",
        created_at=_NOW,
        sensor="comms_guard",
        actor="j.smith",
        target="finance-staff",
        source="scripted",
        action="urgent wire request posing as CFO",
        risk=50,
        level="medium",
        verdict="flagged",
        reason="urgency + authority + secrecy + payment change",
        mitre=[tag("internal_spearphishing"), tag("impersonation"), tag("financial_theft")],
        incident_id="inc-demo",
    ),
    Event(
        id="evt-3",
        created_at=_NOW,
        sensor="agent_firewall",
        actor="j.smith",
        target="finance_agent",
        source="scripted",
        action="send_email payroll.pdf to outside address",
        risk=55,
        level="medium",
        verdict="blocked",
        reason="read-only task cannot send; recipient came from untrusted email",
        mitre=[tag("prompt_injection_indirect"), tag("agent_tool_invocation")],
        incident_id="inc-demo",
    ),
]
_RISK = incident_risk([e.risk for e in _EVENTS], sensor_count=3)
_DEMO = IncidentDetail(
    id="inc-demo",
    created_at=_NOW,
    title="Account takeover chain: j.smith -> finance_agent",
    risk=_RISK,
    level=score_to_level(_RISK),
    status="awaiting_approval",
    source="scripted",
    summary="stub summary",
    triage_label="Likely true positive",
    event_ids=[e.id for e in _EVENTS],
    mitre=[m for e in _EVENTS for m in e.mitre],
    events=_EVENTS,
)


@router.get("", response_model=list[Incident], summary="List incidents (sorted by risk)")
def list_incidents(_: AuthUser = Depends(current_user)) -> list[Incident]:
    return [Incident(**_DEMO.model_dump(exclude={"events"}))]


@router.get("/{incident_id}", response_model=IncidentDetail, summary="Incident with its linked events")
def get_incident(incident_id: str, _: AuthUser = Depends(current_user)) -> IncidentDetail:
    return _find(incident_id)


def _find(incident_id: str) -> IncidentDetail:
    if incident_id != _DEMO.id:
        raise AppError(404, "incident_not_found", "No incident with that id")
    return _DEMO


@router.post(
    "/{incident_id}/containment",
    response_model=Approval,
    summary="Request containment: creates a pending approval for a human to decide",
)
def request_containment(incident_id: str, _: AuthUser = Depends(current_user)) -> Approval:
    """STUB in the final shape: nothing is saved yet. TODO(Daylen, step 9): create the real approval.

    Requesting containment never locks anything by itself; it only asks an approver.
    """
    incident = _find(incident_id)
    return Approval(
        id="apr-demo",
        incident_id=incident.id,
        status="pending",
        # Built from code facts only, never from attacker text.
        summary=f"Containment requested for a {incident.level} incident (risk {incident.risk}). Stub: not saved.",
        created_at=datetime.now(UTC),
    )


@router.post(
    "/{incident_id}/false-positive",
    response_model=Incident,
    summary="Mark an incident as a false positive",
)
def mark_false_positive(incident_id: str, body: FalsePositiveRequest, _: AuthUser = Depends(current_user)) -> Incident:
    """STUB in the final shape: nothing is saved yet. TODO(Daylen, step 8): update the incident + audit log."""
    incident = _find(incident_id)
    return Incident(**incident.model_dump(exclude={"events"}) | {"status": "false_positive"})
