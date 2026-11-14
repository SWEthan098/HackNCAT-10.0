"""Stage 3 hand-off to the Agent Firewall. OWNER: Miles (P2).

Stage 3 of the scripted chain belongs to Ethan's firewall: the finance agent reads a poisoned
email, tries to send payroll outside, and the firewall blocks it and records the events.

    outcome = await run_stage3("protected", db)

With a database, this runs Ethan's agent + firewall (agents.victim.runner.run_agent) as j.smith
with source = scripted. The agent is always his deterministic "gullible" planner, so it falls
for the poisoned email on every run; the firewall that stops it is the real one.

Without a database (offline scripts, unit tests) nothing may touch the network, so a small
scripted stand-in applies the same hard rules and reports the one blocked event at risk 55.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from detectors import scan_injection_mock
from redteam.seed import AGENT_ID, DOMAIN, EXFIL_ADDRESS, PAYROLL_PATH, TAKEOVER_USERNAME, poisoned_email
from schemas.kairos import Event
from schemas.mitre import tag
from sensors.events import record

# The real firewall is used whenever a database is available. Set False to force the stand-in.
FIREWALL_READY = True

BLOCKED_HIJACK_RISK = 55  # plan section 5.13: blocked hijack, nothing leaked
USER_TASK = "Summarize my inbox"  # a read-only task: it never grants send_email


@dataclass(frozen=True)
class Planted:
    """The poisoned email this run uses, for the attacker's log."""

    id: str
    to: str
    subject: str
    path: str  # the file the hidden instruction asks for
    exfil_address: str  # where it asks the agent to send it


@dataclass(frozen=True)
class Stage3Outcome:
    blocked: bool  # the agent tried to act and was stopped
    leaked: bool  # data left the company
    events: list[Event]
    via: str  # "firewall" (Ethan's real one) or "scripted" (the offline stand-in)

    @property
    def event(self) -> Event | None:
        """The event that carries the stage's risk (the highest one)."""
        return max(self.events, key=lambda e: e.risk, default=None)


_ADDRESS = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PATH = re.compile(r"/shared/[\w./-]+")


def uses_real_firewall(db: Any) -> bool:
    return FIREWALL_READY and db is not None


def planted(db: Any = None) -> Planted:
    """Which poisoned email stage 3 will run with: Ethan's fixture, or the seed's for the stand-in."""
    if uses_real_firewall(db):
        from agents.victim.fixtures import POISONED_EMAIL_ID, mailbox_for

        email = next(e for e in mailbox_for(TAKEOVER_USERNAME) if e.id == POISONED_EMAIL_ID)
        outside = [a for a in _ADDRESS.findall(email.body) if not a.lower().endswith(f"@{DOMAIN}")]
        path = _PATH.search(email.body)
        return Planted(
            email.id, email.to, email.subject, path.group() if path else PAYROLL_PATH, outside[0] if outside else "?"
        )
    email = poisoned_email()
    return Planted(email.id, email.to, email.subject, PAYROLL_PATH, EXFIL_ADDRESS)


def _hard_rules_broken() -> list[str]:
    """Which hard rules stop the poisoned email's request. Pure code; no detector involved."""
    broken = ["the task was read-only, so sending email was out of scope"]
    if not EXFIL_ADDRESS.lower().endswith(f"@{DOMAIN}"):
        broken.append(f"the recipient is outside {DOMAIN}")
    broken.append("the instruction came from untrusted email content")
    return broken


def _scripted(mode: str, db: Any = None) -> Stage3Outcome:
    if mode == "unprotected":
        # No Kairos in the path: nothing checks the send, and nothing is recorded.
        return Stage3Outcome(blocked=False, leaked=True, events=[], via="scripted")
    email = poisoned_email()
    scan = scan_injection_mock(email.subject + "\n" + email.body)
    rules = _hard_rules_broken()
    reason = (
        f"Email {email.id} from {TAKEOVER_USERNAME} carried a hidden instruction telling the agent to send "
        f"{PAYROLL_PATH} outside the company. Blocked by hard rules: {'; '.join(rules)}. "
        f"Injection scan: {'flagged' if scan.flagged else 'not flagged'} "
        f"({scan.technique or 'none'}, confidence {scan.confidence:.2f}). Nothing left the company."
    )
    event = record(
        db,
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
    return Stage3Outcome(blocked=True, leaked=False, events=[event], via="scripted")


async def _real_firewall(mode: str, db: Any) -> Stage3Outcome:
    from agents.victim.planner import GulliblePlanner
    from agents.victim.runner import run_agent
    from firewall.integrations import EntityStateReader

    # The scripted chain always uses Ethan's deterministic "gullible" agent. The point of stage 3 is
    # "assume the AI WILL get fooled": a live model sometimes ignores the poisoned email, and then
    # there is nothing to block, the incident stops short of Critical and Unprotected does not leak.
    # The firewall, its hard rules and the events are real; only the agent's choices are scripted.
    # (The audience /attack path still uses the real model.)
    outcome = await run_agent(
        USER_TASK,
        planner=GulliblePlanner(),
        mode=mode,
        actor=TAKEOVER_USERNAME,
        owner=TAKEOVER_USERNAME,
        source="scripted",
        state=EntityStateReader(db),
        db=db,
    )
    via = "firewall"

    # The verdict comes from the firewall's decisions, not from whether its events were saved.
    events: list[Event] = list(outcome.firewall.ctx.events) if outcome.firewall is not None else []
    decisions = outcome.firewall.ctx.decisions if outcome.firewall is not None else []
    blocked = any(d.verdict == "blocked" for d in decisions)
    return Stage3Outcome(blocked=blocked and not outcome.breach, leaked=outcome.breach, events=events, via=via)


async def run_stage3(mode: str, db: Any = None) -> Stage3Outcome:
    if uses_real_firewall(db):
        return await _real_firewall(mode, db)
    return _scripted(mode, db)
