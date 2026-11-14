"""AI Security Analyst + agent run. OWNER: Ethan (P1). Bearer auth.

POST /agent/run runs the victim finance agent (protected = through the Agent Firewall).
POST /analyst/ask answers SOC questions with event + MITRE citations (read-only; runs through the firewall).
POST /analyst/incidents/{id}/summary returns the incident summary + code-computed triage label.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from agents.victim.planner import AgentOffline
from agents.victim.runner import run_agent
from analyst.data import AnalystData
from analyst.service import ask, summarize_incident
from auth import AuthUser, current_user
from core.config import get_settings
from core.db import get_db
from core.errors import AppError
from firewall.integrations import EntityStateReader
from schemas.kairos import AgentRunRequest, AgentRunResponse, AnalystAskRequest, AnalystAskResponse, Decision
from services.ai.ai_service import AIService, get_ai_service

router = APIRouter(tags=["analyst"])


@router.post("/agent/run", response_model=AgentRunResponse, summary="Run the victim agent (protected or not)")
async def agent_run(
    body: AgentRunRequest,
    _: AuthUser = Depends(current_user),
    db=Depends(get_db),
    ai: AIService = Depends(get_ai_service),
) -> AgentRunResponse:
    try:
        outcome = await run_agent(body.user_request, mode=body.mode, state=EntityStateReader(db), ai=ai)
    except AgentOffline as e:
        raise AppError(503, "agent_offline", f"The AI model is unreachable right now ({e.kind}).") from e
    decisions = outcome.firewall.ctx.decisions if outcome.firewall else []
    if outcome.firewall is None:
        decisions = [
            Decision(tool=t, verdict="allowed", layer=None, reason="Unprotected mode: no firewall check.")
            for t, _ in outcome.run.executed
        ]
    return AgentRunResponse(output=outcome.run.output, decisions=decisions)


def _data(db) -> AnalystData:
    return AnalystData(db, demo=get_settings().demo_mode)


@router.post("/analyst/ask", response_model=AnalystAskResponse, summary="Ask the AI security analyst")
async def analyst_ask(
    body: AnalystAskRequest,
    user: AuthUser = Depends(current_user),
    db=Depends(get_db),
    ai: AIService = Depends(get_ai_service),
) -> AnalystAskResponse:
    result = await ask(body.question, data=_data(db), ai=ai, actor=f"soc:{user.id}", state=EntityStateReader(db))
    return AnalystAskResponse(answer=result.answer, citations=result.citations)


@router.post(
    "/analyst/incidents/{incident_id}/summary",
    response_model=AnalystAskResponse,
    summary="AI summary + triage label for one incident",
)
async def analyst_incident_summary(
    incident_id: str,
    _: AuthUser = Depends(current_user),
    db=Depends(get_db),
    ai: AIService = Depends(get_ai_service),
) -> AnalystAskResponse:
    result = await summarize_incident(incident_id, data=_data(db), ai=ai, state=EntityStateReader(db))
    return AnalystAskResponse(answer=result.answer, citations=result.citations)
