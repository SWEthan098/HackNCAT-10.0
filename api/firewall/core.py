"""The Agent Firewall: checks every tool call before it runs. OWNER: Ethan (P1).

    fw = Firewall.for_task(agent="finance_agent", user_request=..., actor="j.smith",
                           target="finance_agent", source="scripted", state=EntityStateReader(db))
    run = await run_task(user_request, workspace=ws, planner=planner, guard=fw)

Order of checks on a tool call (first failure wins, every decision is recorded):
  policy (tool on the agent's list) -> scoped permissions (task grants the tool) -> path allowlist
Hard rules never depend on an AI detector being right.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from agents.victim.tools import ToolResult
from firewall import scoring
from firewall.integrations import EntityStateReader, record
from firewall.policy import AgentPolicy, PolicyError, get_policy
from firewall.scope import Scope, derive_scope
from schemas.kairos import Decision, Event, MitreTag, Source, Verdict
from schemas.mitre import tag

# The five layers shown on the /attack page, in order.
LAYERS = ("injection_scan", "intent_check", "scope_policy", "taint_tracking", "leak_protection")


@dataclass
class TaskContext:
    agent: str
    policy: AgentPolicy | None
    scope: Scope
    actor: str
    target: str
    source: Source
    user_request: str
    requester_trusted: bool = True  # False for audience (/attack): the requester IS the attacker
    dlp_profile: str = "internal"  # "public" for /attack: also redacts salaries, accounts, personal data
    detectors_enabled: bool = True
    decisions: list[Decision] = field(default_factory=list)
    events: list[Event] = field(default_factory=list)
    blocked_layers: list[str] = field(default_factory=list)
    untrusted_seen: bool = False
    max_risk: int = 0
    policy_error: str | None = None


class Firewall:
    def __init__(self, ctx: TaskContext, state: EntityStateReader | None = None):
        self.ctx = ctx
        self.state = state or EntityStateReader(None)

    @classmethod
    def for_task(
        cls,
        *,
        agent: str,
        user_request: str,
        actor: str,
        target: str,
        source: Source,
        state: EntityStateReader | None = None,
        requester_trusted: bool = True,
        dlp_profile: str = "internal",
        detectors_enabled: bool = True,
    ) -> Firewall:
        policy: AgentPolicy | None
        error = None
        try:
            policy = get_policy(agent)
            scope = derive_scope(policy, user_request)
        except PolicyError as e:  # fail closed: no policy = nothing is allowed
            policy, error = None, str(e)
            scope = Scope(frozenset(), read_only=True)
        ctx = TaskContext(
            agent=agent,
            policy=policy,
            scope=scope,
            actor=actor,
            target=target,
            source=source,
            user_request=user_request,
            requester_trusted=requester_trusted,
            dlp_profile=dlp_profile,
            detectors_enabled=detectors_enabled,
            policy_error=error,
        )
        return cls(ctx, state)

    # ---------------------------------------------------------------- recording
    def _decide(
        self,
        tool: str,
        verdict: Verdict,
        layer: str | None,
        reason: str,
        risk: int,
        *,
        action: str | None = None,
        mitre: list[MitreTag] | None = None,
    ) -> Decision:
        ctx = self.ctx
        ctx.max_risk = max(ctx.max_risk, risk)
        if verdict != "allowed" and layer and layer not in ctx.blocked_layers:
            ctx.blocked_layers.append(layer)
        event = record(
            actor=ctx.actor,
            target=ctx.target,
            source=ctx.source,
            action=action or f"{'tool_call' if verdict == 'allowed' else 'tool_call_' + verdict}:{tool}",
            risk=risk,
            verdict=verdict,
            reason=reason,
            mitre=mitre,
        )
        if event is not None:
            ctx.events.append(event)
        decision = Decision(tool=tool, verdict=verdict, layer=layer, reason=reason)
        ctx.decisions.append(decision)
        return decision

    def _attack_tags(self, *extra: str) -> list[MitreTag]:
        keys = [*extra, "agent_tool_invocation"]
        if self.ctx.untrusted_seen:
            keys.insert(0, "prompt_injection_indirect")
        elif not self.ctx.requester_trusted:
            keys.insert(0, "prompt_injection_direct")
        return [tag(k) for k in dict.fromkeys(keys)]

    def _hijack(self) -> bool:
        return self.ctx.untrusted_seen or not self.ctx.requester_trusted

    def _block(self, tool: str, layer: str, reason: str, *, risk: int | None = None, extra: tuple = ()) -> Decision:
        if risk is None:
            risk = scoring.BLOCKED_HIJACK if self._hijack() else scoring.POLICY_VIOLATION
        return self._decide(tool, "blocked", layer, reason, risk, mitre=self._attack_tags(*extra))

    # ---------------------------------------------------------------- guard protocol
    async def before_tool(self, tool: str, args: dict[str, Any]) -> Decision:
        ctx, policy = self.ctx, self.ctx.policy
        if policy is None:
            return self._block(tool, "scope_policy", f"No valid policy for {ctx.agent}, so nothing may run.")
        if not policy.allows_tool(tool):
            return self._block(tool, "scope_policy", f"{ctx.agent} is never allowed to use '{tool}' (policies.yaml).")
        if not ctx.scope.allows(tool):
            return self._block(
                tool,
                "scope_policy",
                f"This task only allowed reading, so '{tool}' was blocked. The request never asked for it.",
            )
        if tool == "read_file" and not policy.path_allowed(str(args.get("path", ""))):
            return self._block(tool, "scope_policy", "That file is outside the folders this agent may read.")
        return self._allow(tool)

    def _allow(self, tool: str) -> Decision:
        sensitive = self.ctx.policy is not None and self.ctx.policy.is_sensitive(tool)
        risk = scoring.ALLOWED_SEND if sensitive else scoring.ALLOWED_READ
        return self._decide(tool, "allowed", "scope_policy", f"'{tool}' is allowed for this task.", risk)

    async def after_tool(self, tool: str, args: dict[str, Any], result: ToolResult) -> str:
        if not result.untrusted:
            return result.content
        self.ctx.untrusted_seen = True
        return f"<<UNTRUSTED {result.origin}>>\n{result.content}\n<<END UNTRUSTED>>"

    async def filter_output(self, text: str) -> str:
        return text
