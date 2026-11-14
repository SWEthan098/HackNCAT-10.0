"""AI Security Analyst + agent run. OWNER: Ethan (P1). Bearer auth.

STUB responses in the final shape. TODO(Ethan): real agent loop + firewall; analyst with
read-only tools and event/MITRE citations.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from auth import AuthUser, current_user
from schemas.kairos import AgentRunRequest, AgentRunResponse, AnalystAskRequest, AnalystAskResponse, Decision

router = APIRouter(tags=["analyst"])


@router.post("/agent/run", response_model=AgentRunResponse, summary="Run the victim agent (protected or not)")
async def agent_run(body: AgentRunRequest, _: AuthUser = Depends(current_user)) -> AgentRunResponse:
    return AgentRunResponse(
        output="stub: inbox summarized",
        decisions=[Decision(tool="read_email", verdict="allowed", layer="scope_policy", reason="stub: read allowed")],
    )


@router.post("/analyst/ask", response_model=AnalystAskResponse, summary="Ask the AI security analyst")
async def analyst_ask(body: AnalystAskRequest, _: AuthUser = Depends(current_user)) -> AnalystAskResponse:
    return AnalystAskResponse(answer="stub: the analyst is not built yet", citations=[])
