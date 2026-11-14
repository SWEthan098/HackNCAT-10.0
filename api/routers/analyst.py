"""AI Security Analyst + agent run. OWNER: Ethan (P1). Bearer auth.

POST /agent/run runs the victim finance agent (protected = through the Agent Firewall).
POST /analyst/ask is still a stub (built in a later step).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from agents.victim.planner import AgentOffline
from agents.victim.runner import run_agent
from auth import AuthUser, current_user
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


@router.post("/analyst/ask", response_model=AnalystAskResponse, summary="Ask the AI security analyst")
async def analyst_ask(body: AnalystAskRequest, _: AuthUser = Depends(current_user)) -> AnalystAskResponse:
    return AnalystAskResponse(answer="stub: the analyst is not built yet", citations=[])
