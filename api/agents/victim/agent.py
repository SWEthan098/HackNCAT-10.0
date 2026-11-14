"""The victim agent's tool loop. OWNER: Ethan (P1).

    run = await run_task("Summarize my inbox", workspace=Workspace.fresh("j.smith"), planner=..., guard=fw_guard)

With a `guard` (the Agent Firewall), every tool call is checked BEFORE it runs, every tool result
is screened before the model sees it, and the final answer is filtered before it leaves.
Without one (unprotected mode) the agent does whatever the model says.
No memory between tasks: all state lives in this call's `steps` and the fresh `Workspace`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from agents.victim.planner import Planner, Step
from agents.victim.tools import SentEmail, ToolResult, Workspace
from schemas.kairos import Decision

MAX_STEPS = 6


class Guard(Protocol):
    async def before_tool(self, tool: str, args: dict[str, Any]) -> Decision: ...
    async def after_tool(self, tool: str, args: dict[str, Any], result: ToolResult) -> str: ...
    async def filter_output(self, text: str) -> str: ...


@dataclass
class AgentRun:
    output: str
    steps: list[Step] = field(default_factory=list)
    executed: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    sent: list[SentEmail] = field(default_factory=list)
    raw_output: str = ""  # before output filtering (for breach accounting only; never returned)


async def run_task(
    user_request: str, *, workspace: Workspace, planner: Planner, guard: Guard | None = None
) -> AgentRun:
    steps: list[Step] = []
    executed: list[tuple[str, dict[str, Any]]] = []
    output = "I stopped after the maximum number of steps."
    for _ in range(MAX_STEPS):
        action = await planner.next_action(user_request, steps)
        if "final" in action:
            output = action["final"]
            break
        tool, args = action["tool"], dict(action.get("args") or {})
        if guard is not None:
            decision = await guard.before_tool(tool, args)
            if decision.verdict != "allowed":
                steps.append(Step(tool, args, f"BLOCKED by the Kairos firewall: {decision.reason}", allowed=False))
                continue
        result = workspace.execute(tool, args)
        executed.append((tool, args))
        text = await guard.after_tool(tool, args, result) if guard is not None else result.content
        steps.append(Step(tool, args, text, allowed=True))
    raw = output
    if guard is not None:
        output = await guard.filter_output(output)
    return AgentRun(output=output, steps=steps, executed=executed, sent=list(workspace.sent), raw_output=raw)
