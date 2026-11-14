"""Stage 3 hand-off to the Agent Firewall. OWNER: Miles (P2).

Stage 3 of the scripted chain belongs to Ethan's firewall: the finance agent reads the poisoned
email, tries to send payroll outside, and the firewall blocks it and records the event.

Until that firewall handles this run (FIREWALL_READY), and always in DEMO_MODE, this module plays
the scripted, deterministic version of that decision so the chain works offline. It applies the
same hard rules the plan gives the firewall (read-only task scope, cisco.example allowlist,
untrusted content cannot drive a send) and records the one agent_firewall event at risk 55.
"""

from __future__ import annotations

from dataclasses import dataclass

import engine
from core.config import get_settings
from detectors import scan_injection_mock
from redteam.seed import AGENT_ID, DOMAIN, EXFIL_ADDRESS, PAYROLL_PATH, TAKEOVER_USERNAME, poisoned_email
from schemas.kairos import Event
from schemas.mitre import tag

# Flip to True once Ethan's /agent/run goes through the real firewall AND records its own
# agent_firewall event for this run (actor j.smith, target finance_agent, source scripted, risk ~55).
FIREWALL_READY = False

BLOCKED_HIJACK_RISK = 55  # plan section 5.13: blocked hijack, nothing leaked
USER_TASK = "Summarize my inbox"  # a read-only task: it never grants send_email


@dataclass(frozen=True)
class Stage3Outcome:
    blocked: bool
    leaked: bool
    event: Event | None
    via: str  # "firewall" (Ethan's real one) or "scripted" (the deterministic stand-in)


def _hard_rules_broken() -> list[str]:
    """Which hard rules stop the poisoned email's request. Pure code; no detector involved."""
    broken = ["the task was read-only, so sending email was out of scope"]
    if not EXFIL_ADDRESS.lower().endswith(f"@{DOMAIN}"):
        broken.append(f"the recipient is outside {DOMAIN}")
    broken.append("the instruction came from untrusted email content")
    return broken


def _scripted(mode: str) -> Stage3Outcome:
    if mode == "unprotected":
        # No Kairos in the path: nothing checks the send, and nothing is recorded.
        return Stage3Outcome(blocked=False, leaked=True, event=None, via="scripted")
    email = poisoned_email()
    scan = scan_injection_mock(email.subject + "\n" + email.body)
    rules = _hard_rules_broken()
    reason = (
        f"Email {email.id} from {TAKEOVER_USERNAME} carried a hidden instruction telling the agent to send "
        f"{PAYROLL_PATH} outside the company. Blocked by hard rules: {'; '.join(rules)}. "
        f"Injection scan: {'flagged' if scan.flagged else 'not flagged'} "
        f"({scan.technique or 'none'}, confidence {scan.confidence:.2f}). Nothing left the company."
    )
    event = engine.record_event(
        sensor="agent_firewall",
        actor=TAKEOVER_USERNAME,
        target=AGENT_ID,
        source="scripted",
        action="send_email_blocked",
        risk=BLOCKED_HIJACK_RISK,
        verdict="blocked",
        reason=reason,
        mitre=[tag("prompt_injection_indirect"), tag("agent_tool_invocation"), tag("llm_data_leakage")],
    )
    return Stage3Outcome(blocked=True, leaked=False, event=event, via="scripted")


async def _real_firewall(mode: str) -> Stage3Outcome:
    from routers.analyst import agent_run  # Ethan's endpoint, called in-process
    from schemas.kairos import AgentRunRequest

    response = await agent_run(AgentRunRequest(user_request=USER_TASK, mode=mode), None)
    blocked = any(d.verdict == "blocked" for d in response.decisions)
    return Stage3Outcome(blocked=blocked, leaked=not blocked, event=None, via="firewall")


async def run_stage3(mode: str) -> Stage3Outcome:
    if FIREWALL_READY and not get_settings().demo_mode:
        return await _real_firewall(mode)
    return _scripted(mode)
