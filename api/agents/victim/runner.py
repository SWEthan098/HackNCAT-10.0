"""One call to run the victim agent, protected or not. OWNER: Ethan (P1).

Miles's Red Team chain can import `run_agent` directly instead of going through HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass

from agents.victim.agent import AgentRun, run_task
from agents.victim.fixtures import Email
from agents.victim.planner import GulliblePlanner, LLMPlanner, Planner
from agents.victim.tools import Workspace
from core.config import get_settings
from firewall.core import Firewall
from firewall.integrations import EntityStateReader
from schemas.kairos import Source
from services.ai.ai_service import AIService, get_ai_service

AGENT = "finance_agent"


def pick_planner(ai: AIService, *, force_real_model: bool = False) -> Planner:
    """Real model unless we're on the mock provider, or DEMO_MODE (except where force_real_model)."""
    if ai.provider.name == "mock":
        return GulliblePlanner()
    if get_settings().demo_mode and not force_real_model:
        return GulliblePlanner()
    return LLMPlanner(ai)


@dataclass
class AgentOutcome:
    run: AgentRun
    firewall: Firewall | None  # None in unprotected mode


async def run_agent(
    user_request: str,
    *,
    mode: str = "protected",
    actor: str = "j.smith",
    owner: str = "j.smith",
    source: Source = "scripted",
    state: EntityStateReader | None = None,
    ai: AIService | None = None,
    planner: Planner | None = None,
    extra_emails: list[Email] | None = None,
    requester_trusted: bool = True,
    dlp_profile: str = "internal",
    detectors_enabled: bool = True,
    force_real_model: bool = False,
) -> AgentOutcome:
    planner = planner or pick_planner(ai or get_ai_service(), force_real_model=force_real_model)
    workspace = Workspace.fresh(owner, mode=mode, actor=actor, extra_emails=extra_emails)
    fw = None
    if mode == "protected":
        fw = Firewall.for_task(
            agent=AGENT,
            user_request=user_request,
            actor=actor,
            target=AGENT,
            source=source,
            state=state,
            requester_trusted=requester_trusted,
            dlp_profile=dlp_profile,
            detectors_enabled=detectors_enabled,
        )
    run = await run_task(user_request, workspace=workspace, planner=planner, guard=fw)
    return AgentOutcome(run=run, firewall=fw)
