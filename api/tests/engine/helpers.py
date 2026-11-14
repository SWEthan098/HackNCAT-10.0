"""Shared builders for engine tests. OWNER: Daylen (P3)."""

from __future__ import annotations

import uuid

from engine import record_event
from schemas.mitre import tag


def stage1(db, **kw):
    """Bot guesses passwords and gets into j.smith."""
    args = {
        "sensor": "login_guard",
        "actor": "bot:203.0.113.7",
        "target": "j.smith",
        "source": "scripted",
        "action": "credential stuffing, then login success",
        "risk": 45,
        "verdict": "flagged",
        "reason": "143 fast failures then a success",
        "mitre": [tag("credential_stuffing"), tag("valid_accounts")],
    }
    return record_event(**{**args, **kw}, db=db)


def stage2(db, **kw):
    """j.smith's account sends a fake CFO wire request."""
    args = {
        "sensor": "comms_guard",
        "actor": "j.smith",
        "target": "finance-staff",
        "source": "scripted",
        "action": "urgent wire request posing as CFO",
        "risk": 50,
        "verdict": "flagged",
        "reason": "urgency + authority + secrecy + payment change",
        "mitre": [tag("internal_spearphishing"), tag("impersonation"), tag("financial_theft")],
    }
    return record_event(**{**args, **kw}, db=db)


def stage3(db, **kw):
    """A poisoned email tries to make the AI assistant send payroll outside."""
    args = {
        "sensor": "agent_firewall",
        "actor": "j.smith",
        "target": "finance_agent",
        "source": "scripted",
        "action": "send_email payroll.pdf to outside address",
        "risk": 55,
        "verdict": "blocked",
        "reason": "read-only task cannot send; recipient came from untrusted email",
        "mitre": [tag("prompt_injection_indirect"), tag("agent_tool_invocation"), tag("llm_data_leakage")],
    }
    return record_event(**{**args, **kw}, db=db)


def full_chain(db):
    return [stage1(db), stage2(db), stage3(db)]


def judge_attack(db, nickname: str, *, sensors=("login_guard", "comms_guard", "agent_firewall"), target="guest01"):
    """One audience member's attempts: actor judge:<nickname>, guest accounts only."""
    return [
        record_event(
            sensor=sensor,
            actor=f"judge:{nickname}",
            target=target if sensor != "agent_firewall" else "finance_agent",
            source="audience",
            action="audience attack",
            risk=40,
            verdict="blocked",
            reason="blocked by policy",
            db=db,
        )
        for sensor in sensors
    ]


def as_role(fake_db, token_factory, role: str | None = None) -> tuple[dict, str]:
    """(auth header, user id) for a fresh signed-in user, optionally holding `role`."""
    uid = str(uuid.uuid4())
    if role:
        fake_db.grant_role(uid, role)
    return {"Authorization": f"Bearer {token_factory(sub=uid)}"}, uid


def rows(fake_db, table: str) -> list[dict]:
    return fake_db.tables[table].rows
