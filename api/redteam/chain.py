"""The scripted 3-stage Red Team chain (source = scripted). OWNER: Miles (P2).

    result = await run("full_chain", "protected", db=db)

    Stage 1  bot guesses j.smith's password        Login Guard     ~45  Medium
    Stage 2  j.smith's account sends a fake CFO    Comms Guard     ~50  Medium
             wire request to Finance
    Stage 3  poisoned email tells the AI agent     Agent Firewall  ~55  Medium (blocked)
             to send payroll outside

All three link through j.smith (the bot's target becomes the next actor), so the engine fuses
them into ONE incident: 55 + 15 + 15 = 85 Critical.

Hardcoded to the fictional cisco.example sandbox: there is no parameter that picks a target.
`log_lines` show only what a real attacker would see. In "unprotected" mode Kairos is not in the
path at all, so nothing is checked and no events are recorded.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from redteam import firewall_bridge
from redteam.seed import (
    CFO_USERNAME,
    DOMAIN,
    TAKEOVER_USERNAME,
    check_password,
    get_account,
)
from schemas.kairos import Event
from sensors.comms_guard import get_message, handle_message
from sensors.login_guard import handle_login, is_locked

Stage = Literal["credential_stuffing", "impersonation", "prompt_injection", "full_chain"]
Mode = Literal["protected", "unprotected"]

BOT_ACTOR = "bot:203.0.113.7"  # 203.0.113.0/24 is reserved for documentation: not a real host
WIRE_RECIPIENT = "e.cruz"  # Finance Manager: the person the fake CFO leans on
WIRE_AMOUNT = "$48,500"

# The order the bot tries passwords in: seasonal ones late, so j.smith falls on try 9.
BOT_WORDLIST: tuple[str, ...] = (
    "123456",
    "password",
    "qwerty123",
    "letmein",
    "welcome1",
    "Password1!",
    "admin123",
    "Cisco123",
    "Summer2026!",
    "Winter2025!",
    "Spring2026!",
    "iloveyou",
)
BOT_ATTEMPTS_PER_MINUTE = 12  # "low and slow", with human-looking typing, to stay under the radar

FAKE_CFO_MESSAGE = (
    "Hi Elena, this is Marcus Vale, CFO. I'm tied up with the auditors and writing from Jamie's account. "
    f"I need you to wire {WIRE_AMOUNT} to our vendor today. I'll send the paperwork after."
)


@dataclass
class StageResult:
    stage: str
    outcome: str
    log_lines: list[str] = field(default_factory=list)
    events: list[Event] = field(default_factory=list)
    message_id: str | None = None  # stage 2: the delivered wire request, if Comms Guard is tracking it

    @property
    def stopped(self) -> bool:
        """True if the attacker cannot continue to the next stage."""
        return self.outcome == "account_locked"


def _address(username: str) -> str:
    return f"{username}@{DOMAIN}"


def _stage1_features(failed: int, success: bool) -> dict[str, Any]:
    return {
        "failed_attempts": failed,
        "attempts_per_minute": BOT_ATTEMPTS_PER_MINUTE,
        "avg_keystroke_interval_ms": 95,  # the bot fakes a typing rhythm
        "keystroke_interval_stddev_ms": 22,
        "accounts_from_source": 1,
        "success_after_failures": success,
    }


def stage1_credential_stuffing(mode: Mode, db: Any = None) -> StageResult:
    target = TAKEOVER_USERNAME
    result = StageResult("credential_stuffing", "failed")
    log = result.log_lines
    log.append(f"[stage 1] credential stuffing -> {_address(target)}")
    log.append(f"loaded wordlist: {len(BOT_WORDLIST)} common passwords, {BOT_ATTEMPTS_PER_MINUTE}/min")

    if mode == "protected" and is_locked(db, target):
        guard = handle_login(target, _stage1_features(1, False), actor=BOT_ACTOR, source="scripted", db=db)
        result.events.append(guard.event)
        log.append("try 1/12: ACCESS DENIED (account locked)")
        log.append("target account is locked. Attack stopped.")
        result.outcome = "account_locked"
        return result

    failed, cracked = 0, False
    for n, guess in enumerate(BOT_WORDLIST, start=1):
        if check_password(target, guess):
            cracked = True
            log.append(f"try {n}/{len(BOT_WORDLIST)}: ACCEPTED")
            break
        failed += 1
        log.append(f"try {n}/{len(BOT_WORDLIST)}: rejected")

    if mode == "protected":
        guard = handle_login(target, _stage1_features(failed, cracked), actor=BOT_ACTOR, source="scripted", db=db)
        result.events.append(guard.event)
        if guard.response == "blocked":
            log.append("ACCESS DENIED: sign-in paused by the defender")
            result.outcome = "blocked"
            return result
        if guard.response == "challenged":
            log.append("verification required before sign-in: ACCESS DENIED")
            result.outcome = "challenged"
            return result
        if guard.response != "watched":
            log.append("responses are getting slower (throttled?)")

    if cracked:
        log.append(f"session opened as {target}")
        result.outcome = "account_compromised"
    else:
        log.append("wordlist exhausted, no valid password")
    return result


async def stage2_impersonation(mode: Mode, db: Any = None) -> StageResult:
    sender, recipient = _address(TAKEOVER_USERNAME), _address(WIRE_RECIPIENT)
    cfo = get_account(CFO_USERNAME)
    result = StageResult("impersonation", "message_delivered")
    log = result.log_lines
    log.append(f"[stage 2] CFO impersonation: {sender} -> {recipient}")
    log.append(f'posing as {cfo.name} ({cfo.title}): "wire {WIRE_AMOUNT} to our vendor today"')

    if mode == "protected":
        # Rules only, so the stage scores the same on every run.
        guard = await handle_message(
            sender=sender, to=recipient, body=FAKE_CFO_MESSAGE, source="scripted", db=db, use_model=False
        )
        result.events.append(guard.event)
        result.message_id = guard.message_id
        if guard.response == "blocked":
            log.append("message rejected: NOT DELIVERED")
            result.outcome = "blocked"
            return result
        if guard.response == "challenged":
            log.append("message accepted by the server...")
            log.append("no delivery receipt: HELD (not in the inbox)")
            result.outcome = "message_held"
            return result
    log.append("message delivered")
    log.append("waiting for Finance to act on it...")
    return result


async def stage3_prompt_injection(mode: Mode, db: Any = None) -> StageResult:
    email = firewall_bridge.planted(db)
    result = StageResult("prompt_injection", "blocked")
    log = result.log_lines
    log.append(f"[stage 3] prompt injection -> finance AI assistant ({email.to})")
    log.append(f'planted email {email.id}: "{email.subject}" with a hidden instruction')
    log.append(f"hidden goal: send {email.path} to {email.exfil_address}")
    log.append("waiting for the assistant to read the inbox...")

    outcome = await firewall_bridge.run_stage3(mode, db)
    # Routine allowed tool calls (risk 0) stay in the database; the chain keeps the ones that matter.
    result.events += [e for e in outcome.events if e.risk > 0]
    filename = email.path.rsplit("/", 1)[-1]
    if outcome.leaked:
        log.append(f"assistant sent {filename} to {email.exfil_address}")
        log.append("exfiltration: SUCCESS (payroll records received)")
        result.outcome = "leaked"
    elif outcome.blocked:
        log.append("exfiltration attempt: ACCESS DENIED")
        log.append("nothing received")
    else:
        log.append("the assistant did not act on the hidden instruction")
        log.append("nothing received")
        result.outcome = "no_effect"
    return result


async def run(stage: Stage, mode: Mode = "protected", db: Any = None) -> StageResult:
    """Run one stage, or the full chain in order. The chain stops if the account is locked."""
    if stage == "credential_stuffing":
        return stage1_credential_stuffing(mode, db)
    if stage == "impersonation":
        return await stage2_impersonation(mode, db)
    if stage == "prompt_injection":
        return await stage3_prompt_injection(mode, db)
    if stage != "full_chain":
        raise ValueError(f"unknown stage: {stage}")

    chain = StageResult("full_chain", "failed")
    chain.log_lines.append(f"=== full chain against the {mode} {DOMAIN} sandbox ===")
    first = stage1_credential_stuffing(mode, db)
    steps = [first]
    if first.outcome == "account_compromised":
        steps.append(await stage2_impersonation(mode, db))
        steps.append(await stage3_prompt_injection(mode, db))
    for step in steps:
        chain.log_lines += step.log_lines
        chain.events += step.events
    chain.outcome = steps[-1].outcome
    # If the incident escalated, Comms Guard has pulled the wire request back out of the inbox.
    recalled = next((m for m in map(get_message, (s.message_id for s in steps)) if m and m.held), None)
    if recalled is not None:
        chain.message_id = recalled.id
        chain.events.append(recalled.recall_event)
        chain.log_lines.append(f"wire request to {_address(recalled.recipient)}: RECALLED (no longer in the inbox)")
    chain.log_lines.append(f"=== chain finished: {chain.outcome} ===")
    return chain
