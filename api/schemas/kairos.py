"""Kairos shared data contract. OWNER: Daylen (P3). FROZEN after the scaffold merges.

Every listener writes `Event`s through engine.record_event(); the engine groups them into
`Incident`s. Mirrored in TypeScript at web/src/lib/types/kairos.ts. Change both together, in one
small PR by the owner, then everyone rebases.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Sensor = Literal["login_guard", "comms_guard", "agent_firewall"]
Source = Literal["scripted", "audience"]
Level = Literal["low", "medium", "high", "critical"]
Verdict = Literal["allowed", "flagged", "blocked"]
IncidentStatus = Literal["new", "investigating", "awaiting_approval", "contained", "closed", "false_positive"]
ApprovalStatus = Literal["pending", "approved", "denied", "expired"]
Framework = Literal["ATTACK", "ATLAS"]


class MitreTag(BaseModel):
    framework: Framework
    tactic: str
    technique_id: str
    name: str


class Event(BaseModel):
    id: str
    created_at: datetime
    sensor: Sensor
    actor: str = Field(description="Who did it, e.g. 'bot:203.0.113.7', 'j.smith', 'judge:agent-falcon'")
    target: str = Field(description="Who or what it hit, e.g. 'j.smith', 'finance_agent'")
    source: Source
    action: str
    risk: int = Field(ge=0, le=100)
    level: Level
    verdict: Verdict
    reason: str = Field(description="Plain-English explanation shown in the console")
    mitre: list[MitreTag] = Field(default_factory=list)
    incident_id: str | None = None


class Detection(BaseModel):
    """Every AI detector returns this shape (see detectors/)."""

    flagged: bool
    confidence: float = Field(ge=0, le=1)
    technique: str | None = None
    explanation: str


class Incident(BaseModel):
    id: str
    created_at: datetime
    title: str
    risk: int = Field(ge=0, le=100)
    level: Level
    status: IncidentStatus
    source: Source
    summary: str | None = None
    triage_label: str | None = None
    event_ids: list[str] = Field(default_factory=list)
    mitre: list[MitreTag] = Field(default_factory=list)


class IncidentDetail(Incident):
    events: list[Event] = Field(default_factory=list)


class Approval(BaseModel):
    id: str
    incident_id: str
    status: ApprovalStatus
    summary: str
    decided_by: str | None = None
    decided_at: datetime | None = None
    created_at: datetime


# ---------------------------------------------------------------------------------------
# Request / response bodies, one block per router. Stubs return these exact shapes.
# ---------------------------------------------------------------------------------------


class AgentRunRequest(BaseModel):
    user_request: str = Field(min_length=1, max_length=2000)
    mode: Literal["protected", "unprotected"] = "protected"


class Decision(BaseModel):
    tool: str
    verdict: Verdict
    layer: str | None = None
    reason: str


class AgentRunResponse(BaseModel):
    output: str
    decisions: list[Decision]


class AttackRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)
    delivery: Literal["direct", "email"] = "direct"
    nickname: str = Field(min_length=1, max_length=40)


class LayerResult(BaseModel):
    name: str
    status: Literal["passed", "blocked", "skipped"]


class AttackResponse(BaseModel):
    verdict: Verdict
    blocked_by: str | None = None
    reason: str
    layers: list[LayerResult]
    technique: MitreTag | None = None
    breach: bool = False


class AnalystAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


class AnalystAskResponse(BaseModel):
    answer: str
    citations: list[str] = Field(default_factory=list, description="Event IDs the answer is based on")


class LoginSignalRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    features: dict[str, Any] = Field(default_factory=dict, description="Timing/metadata only, never typed content")


class MessageSignalRequest(BaseModel):
    sender: str = Field(alias="from", min_length=1, max_length=200)
    to: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=5000)

    model_config = {"populate_by_name": True}


class SensorResponse(BaseModel):
    verdict: Verdict
    detection: Detection


class RedteamRunRequest(BaseModel):
    stage: Literal["credential_stuffing", "impersonation", "prompt_injection", "full_chain"]
    target: Literal["protected", "unprotected"] = "protected"


class RedteamRunResponse(BaseModel):
    log_lines: list[str]
    outcome: str


class PlaygroundLaunchRequest(BaseModel):
    attack_type: Literal["password_guessing", "fake_boss", "trick_ai", "full_attack"]
    settings: dict[str, Any] = Field(default_factory=dict)
    nickname: str = Field(min_length=1, max_length=40)


class PlaygroundLaunchResponse(BaseModel):
    log_lines: list[str]
    outcome: str
    risk: int = Field(ge=0, le=100)
    response_level: Literal["watched", "slowed", "challenged", "blocked"]


class AppealRequest(BaseModel):
    event_id: str | None = None
    incident_id: str | None = None
    reason: str = Field(min_length=1, max_length=1000)


class Appeal(BaseModel):
    id: str
    created_at: datetime
    event_id: str | None = None
    incident_id: str | None = None
    reason: str
    status: Literal["open", "accepted", "rejected"] = "open"


class AuditVerifyResponse(BaseModel):
    ok: bool
    entries_checked: int
    first_bad_entry: str | None = None


class Stats(BaseModel):
    attacks_blocked: int
    breaches: int
    false_positives: int
    avg_decision_ms: float
    open_incidents: dict[Level, int]


class OkResponse(BaseModel):
    ok: bool = True
    detail: str | None = None
