"""The Agent Firewall: checks every tool call before it runs. OWNER: Ethan (P1).

    fw = Firewall.for_task(agent="finance_agent", user_request=..., actor="j.smith",
                           target="finance_agent", source="scripted", state=EntityStateReader(db))
    run = await run_task(user_request, workspace=ws, planner=planner, guard=fw)

Order of checks on a tool call (first failure wins, every decision is recorded):
  policy (tool on the agent's list) -> scoped permissions (task grants the tool) -> path allowlist
  -> send_email: domain allowlist (@cisco.example only) -> taint (recipient and sensitive data must
     trace back to the human's request, never to content the agent read)
Hard rules never depend on an AI detector being right.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any

import engine
from agents.victim.tools import ToolResult
from firewall import detection, dlp, rules, scoring
from firewall.detection import DetectorOutcome
from firewall.integrations import GLOBAL_FREEZE_ENTITIES, EntityStateReader, record, request_approval
from firewall.policy import AgentPolicy, PolicyError, get_policy
from firewall.scope import Scope, derive_scope
from firewall.taint import TaintTracker, labels_requested, recipients
from firewall.vault import canary_hit, canary_in_args
from schemas.kairos import Decision, Event, MitreTag, Source, Verdict
from schemas.mitre import tag

LEVEL_RANK = {"low": 0, "medium": 1, "high": 2, "critical": 3}

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
    record_allowed: bool = True  # the analyst only records non-allowed decisions (keeps the stream clean)
    decisions: list[Decision] = field(default_factory=list)
    events: list[Event] = field(default_factory=list)
    blocked_layers: list[str] = field(default_factory=list)
    untrusted_seen: bool = False
    taint: TaintTracker = field(default_factory=TaintTracker)
    canary_hits: int = 0
    injection: list[DetectorOutcome] = field(default_factory=list)  # flagged scans of untrusted content
    scanner_failed: bool = False
    held_layers: list[str] = field(default_factory=list)  # actions waiting for a human ("Awaiting Approval")
    approvals: list[str] = field(default_factory=list)
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
        record_allowed: bool = True,
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
            record_allowed=record_allowed,
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
        if verdict == "blocked" and layer and layer not in ctx.blocked_layers:
            ctx.blocked_layers.append(layer)
        skip = verdict == "allowed" and not ctx.record_allowed
        event = (
            None
            if skip
            else record(
                actor=ctx.actor,
                target=ctx.target,
                source=ctx.source,
                action=action or f"{'tool_call' if verdict == 'allowed' else 'tool_call_' + verdict}:{tool}",
                risk=risk,
                verdict=verdict,
                reason=reason,
                mitre=mitre,
            )
        )
        if event is not None:
            ctx.events.append(event)
        decision = Decision(tool=tool, verdict=verdict, layer=layer, reason=reason)
        ctx.decisions.append(decision)
        return decision

    def _attack_tags(self, *extra: str, hijack: bool = True) -> list[MitreTag]:
        keys = [*extra, "agent_tool_invocation"]
        if hijack and self.ctx.untrusted_seen and self.ctx.requester_trusted:
            keys.insert(0, "prompt_injection_indirect")
        elif not self.ctx.requester_trusted:
            keys.insert(0, "prompt_injection_direct")
        return [tag(k) for k in dict.fromkeys(keys)]

    def _hijack(self, args: dict[str, Any] | None = None) -> bool:
        """Was this blocked action driven by an attacker rather than by the human's own request?

        Yes when the requester is untrusted (/attack), an injection was flagged in this task, the
        tool wasn't asked for but the agent had read untrusted content, or a recipient doesn't come
        from the human's request."""
        ctx = self.ctx
        if not ctx.requester_trusted or ctx.injection:
            return True
        if args is None:
            return ctx.untrusted_seen
        return any(to not in ctx.scope.trusted_recipients for to in recipients(str(args.get("to", ""))))

    def _block(
        self,
        tool: str,
        layer: str,
        reason: str,
        *,
        risk: int | None = None,
        extra: tuple = (),
        args: dict[str, Any] | None = None,
    ) -> Decision:
        hijack = self._hijack(args)
        if risk is None:
            risk = scoring.BLOCKED_HIJACK if hijack else scoring.POLICY_VIOLATION
        return self._decide(tool, "blocked", layer, reason, risk, mitre=self._attack_tags(*extra, hijack=hijack))

    # ---------------------------------------------------------------- guard protocol
    async def before_tool(self, tool: str, args: dict[str, Any]) -> Decision:
        ctx, policy = self.ctx, self.ctx.policy
        if policy is None:
            return self._block(tool, "scope_policy", f"No valid policy for {ctx.agent}, so nothing may run.")
        # One batched lookup in a worker thread, so a slow database never stalls the event loop.
        await asyncio.to_thread(self.state.prefetch, [ctx.agent, *GLOBAL_FREEZE_ENTITIES, ctx.actor])
        contained = await asyncio.to_thread(self._check_containment, tool)
        if contained is not None:
            return contained
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
        if canary_in_args(args):
            self.ctx.canary_hits += 1
            return self._block(
                tool,
                "leak_protection",
                "The secret vault code appeared in this action, so it was stopped.",
                risk=scoring.LEAK_OR_CANARY,
                extra=("llm_data_leakage",),
            )
        if tool == "send_email":
            blocked = self._check_send(args)
            if blocked is not None:
                return blocked
        if policy.is_sensitive(tool) and ctx.scanner_failed:
            return self._block(
                tool,
                "injection_scan",
                "The injection scanner could not check what the agent read, so sensitive actions are blocked.",
                risk=scoring.SCANNER_FAILURE,
            )
        if policy.is_sensitive(tool):
            held = await self._maybe_hold(tool, args)
            if held is not None:
                return held
        return self._allow(tool)

    # ---------------------------------------------------------------- containment + auto-hold
    def _check_containment(self, tool: str) -> Decision | None:
        """Frozen agent or locked actor = block. The firewall only READS this state; humans change it."""
        ctx = self.ctx
        if self.state.agent_frozen(ctx.agent):
            return self._decide(
                tool,
                "blocked",
                "containment",
                f"{ctx.agent} is frozen by a human (kill switch or freeze), so it cannot act.",
                scoring.FROZEN_AGENT,
                action=f"tool_call_blocked:{tool}:agent_frozen",
            )
        if self.state.actor_locked(ctx.actor):
            return self._decide(
                tool,
                "blocked",
                "containment",
                f"The account {ctx.actor} is locked pending review, so its assistant cannot act.",
                scoring.FROZEN_AGENT,
                action=f"tool_call_blocked:{tool}:actor_locked",
            )
        return None

    async def _maybe_hold(self, tool: str, args: dict[str, Any]) -> Decision | None:
        """Hold an otherwise-allowed sensitive action for a human when the code-computed risk is high."""
        ctx, policy = self.ctx, self.ctx.policy
        risk, layer, why = scoring.ALLOWED_SEND, "auto_hold", ""
        flagged = [o for o in ctx.injection if not o.failed]
        if flagged:
            conf = max(o.detection.confidence for o in flagged)
            risk, layer, why = (
                scoring.injection_points(conf) + scoring.SENSITIVE_AFTER_INJECTION,
                "injection_scan",
                "the agent read content flagged as a prompt injection",
            )
        safe_args = {k: dlp.redact(str(v), dlp.PUBLIC).text[:300] for k, v in args.items()}
        intent = await detection.intent(
            ctx.user_request, {"tool": tool, "args": safe_args}, enabled=ctx.detectors_enabled
        )
        if intent.flagged:
            points = (
                scoring.SCANNER_FAILURE
                if intent.failed
                else scoring.injection_points(intent.detection.confidence) + scoring.SENSITIVE_AFTER_INJECTION
            )
            if points > risk:
                risk, layer = points, "intent_check"
                why = "the intent check could not run" if intent.failed else "this action doesn't match your request"
        frozen = await asyncio.to_thread(self.state.agent_frozen, ctx.agent)
        if frozen is None and scoring.SCANNER_FAILURE > risk:
            risk, layer, why = scoring.SCANNER_FAILURE, "containment", "Kairos could not confirm the agent's status"
        if LEVEL_RANK[engine.score_to_level(risk)] < LEVEL_RANK[policy.requires_approval_at_level]:
            return None
        decision = self._decide(
            tool,
            "flagged",
            layer,
            f"Held for human approval: {why}. Nothing was sent; an approver can release it.",
            risk,
            action=f"tool_call_held:{tool}",
            mitre=self._attack_tags(),
        )
        ctx.held_layers.append(layer)
        event = ctx.events[-1] if ctx.events else None
        summary = (
            f"Kairos held a {tool} action by {ctx.agent} for {ctx.actor} "
            f"(risk {risk}, {engine.score_to_level(risk)}; layer: {layer}). "
            "Approve to release it or deny to keep it stopped."
        )
        approval_id = request_approval(event, summary)
        if approval_id:
            ctx.approvals.append(approval_id)
        return decision

    def _check_send(self, args: dict[str, Any]) -> Decision | None:
        ctx, policy = self.ctx, self.ctx.policy
        body = str(args.get("subject", "")) + "\n" + str(args.get("body", ""))
        leaked = ctx.taint.sensitive_labels_in(body)
        exfil = ("llm_data_leakage",) if leaked else ()
        domains = ", ".join("@" + d for d in policy.send_email.allowed_domains)
        for to in recipients(str(args.get("to", ""))):
            if not policy.domain_allowed(to):
                return self._block(
                    "send_email",
                    "scope_policy",
                    f"Email can only go to {domains}; '{to}' is outside.",
                    extra=exfil,
                    args=args,
                )
        for to in recipients(str(args.get("to", ""))):
            if to not in ctx.scope.trusted_recipients:
                origin = ctx.taint.origin_of(to)
                where = f"untrusted content ({origin})" if origin else "the AI, not from your request"
                return self._block(
                    "send_email",
                    "taint_tracking",
                    f"The recipient '{to}' came from {where}. Only addresses you typed can receive email.",
                    risk=scoring.BLOCKED_HIJACK,
                    extra=exfil,
                )
        unrequested = leaked - labels_requested(ctx.user_request)
        if unrequested:
            return self._block(
                "send_email",
                "taint_tracking",
                f"This email contains {', '.join(sorted(unrequested))} data your request never asked to send.",
                risk=scoring.BLOCKED_HIJACK,
                extra=exfil,
            )
        kinds = dlp.scan(body, ctx.dlp_profile)
        if kinds:
            return self._block(
                "send_email",
                "leak_protection",
                f"This email contains protected data ({', '.join(kinds)}), so it was not sent.",
                risk=scoring.SENSITIVE_DATA_BLOCKED,
                extra=("llm_data_leakage",),
            )
        if dlp.has_foreign_links(body, policy.send_email.allowed_domains):
            return self._block(
                "send_email",
                "leak_protection",
                "This email links to a site outside cisco.example, which could carry data out.",
                risk=scoring.BLOCKED_HIJACK if self._hijack() else scoring.POLICY_VIOLATION,
                extra=("llm_data_leakage",),
            )
        return None

    def _allowed_link_domains(self) -> list[str]:
        policy = self.ctx.policy
        return list(policy.send_email.allowed_domains) if policy and policy.send_email else ["cisco.example"]

    def _allow(self, tool: str) -> Decision:
        sensitive = self.ctx.policy is not None and self.ctx.policy.is_sensitive(tool)
        risk = scoring.ALLOWED_SEND if sensitive else scoring.ALLOWED_READ
        return self._decide(tool, "allowed", "scope_policy", f"'{tool}' is allowed for this task.", risk)

    async def after_tool(self, tool: str, args: dict[str, Any], result: ToolResult) -> str:
        if not result.untrusted:
            return result.content
        self.ctx.untrusted_seen = True
        self.ctx.taint.add(result.origin, result.content, result.labels)
        await self._scan_untrusted(result.content, result.origin, indirect=True)
        # The model never needs SSNs, keys or card numbers: strip them before it sees the data.
        content = dlp.redact(result.content, dlp.INTERNAL).text
        return f"<<UNTRUSTED {result.origin}>>\n{content}\n<<END UNTRUSTED>>"

    async def _scan_untrusted(self, text: str, origin: str, *, indirect: bool) -> DetectorOutcome:
        ctx = self.ctx
        outcome = await detection.scan(text, enabled=ctx.detectors_enabled)
        backstop = rules.keyword_scan(text)  # code rules: on even when the AI detectors are off
        if not outcome.flagged and backstop.flagged:
            outcome = DetectorOutcome(backstop)
        if not outcome.flagged:
            return outcome
        ctx.injection.append(outcome)
        ctx.scanner_failed = ctx.scanner_failed or outcome.failed
        d = outcome.detection
        keys = ["prompt_injection_indirect" if indirect else "prompt_injection_direct"]
        if detection.is_obfuscation(d) or detection.is_obfuscation(backstop):
            keys.append("prompt_obfuscation")
        if detection.is_jailbreak(d) or detection.is_jailbreak(backstop):
            keys.append("llm_jailbreak")
        risk = scoring.SCANNER_FAILURE if outcome.failed else scoring.injection_points(d.confidence)
        what = "could not be scanned" if outcome.failed else "contains instructions aimed at the AI"
        self._decide(
            "scan",
            "flagged",
            "injection_scan",
            f"Content from {origin} {what}: {d.explanation}",
            risk,
            action="injection_detected" if not outcome.failed else "injection_scan_failed",
            mitre=[tag(k) for k in keys],
        )
        return outcome

    async def screen_request(self, text: str) -> DetectorOutcome:
        """Scan a request typed by an untrusted requester (e.g. /attack direct delivery)."""
        return await self._scan_untrusted(text, "the request", indirect=False)

    async def filter_output(self, text: str) -> str:
        if canary_hit(text):
            self.ctx.canary_hits += 1
            self._decide(
                "reply",
                "blocked",
                "leak_protection",
                "The reply contained the secret vault code, so it was withheld.",
                scoring.LEAK_OR_CANARY,
                action="output_blocked:canary",
                mitre=self._attack_tags("llm_data_leakage"),
            )
            return "I can't share that. (Kairos withheld this reply because it contained protected data.)"
        cleaned = dlp.redact(text, self.ctx.dlp_profile)
        text, links = dlp.strip_links(cleaned.text, self._allowed_link_domains())
        if cleaned.found:
            outsider = self.ctx.dlp_profile == dlp.PUBLIC
            self._decide(
                "reply",
                "blocked",
                "leak_protection",
                f"Protected data was removed from the reply ({', '.join(cleaned.kinds)}).",
                scoring.SENSITIVE_DATA_BLOCKED if outsider else scoring.DLP_REDACTED_INTERNAL,
                action="output_redacted:dlp",
                mitre=self._attack_tags("llm_data_leakage") if outsider else [],
            )
        if links:
            self._decide(
                "reply",
                "flagged",
                "leak_protection",
                f"Removed {links} link(s) or image(s) pointing outside cisco.example.",
                scoring.LINKS_STRIPPED,
                action="output_sanitized:links",
            )
        return text
