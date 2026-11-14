"""MITRE ATT&CK + ATLAS lookup table. OWNER: Daylen (P3). FROZEN after the scaffold merges.

Technique IDs come ONLY from this table, never from an LLM, so nothing gets made up on stage.
Verified 2026-11-13 against ATT&CK v20.1 (attack.mitre.org) and ATLAS 2026.10 (the
mitre-atlas/atlas-data release file). Two IDs changed from the plan; the KEYS did not:
- "impersonation": T1656 is gone from the live site. Impersonation is now T1684.001, a
  sub-technique of T1684 Social Engineering, under the tactic ATT&CK now calls "Stealth" (TA0005).
- "llm_data_leakage": AML.T0057 was removed in ATLAS 2026.10. Our stage 3 (the agent is tricked
  into emailing payroll outside) is AML.T0086 Exfiltration via AI Agent Tool Invocation.
"""

from __future__ import annotations

from schemas.kairos import MitreTag

MITRE: dict[str, MitreTag] = {
    # ---- ATT&CK: attacks on people and accounts ----
    "credential_stuffing": MitreTag(
        framework="ATTACK", tactic="Credential Access", technique_id="T1110.004", name="Credential Stuffing"
    ),
    "valid_accounts": MitreTag(
        framework="ATTACK", tactic="Initial Access", technique_id="T1078", name="Valid Accounts"
    ),
    "internal_spearphishing": MitreTag(
        framework="ATTACK", tactic="Lateral Movement", technique_id="T1534", name="Internal Spearphishing"
    ),
    "impersonation": MitreTag(framework="ATTACK", tactic="Stealth", technique_id="T1684.001", name="Impersonation"),
    "financial_theft": MitreTag(framework="ATTACK", tactic="Impact", technique_id="T1657", name="Financial Theft"),
    # ---- ATLAS: attacks on AI systems ----
    "prompt_injection_direct": MitreTag(
        framework="ATLAS", tactic="Execution", technique_id="AML.T0051.000", name="LLM Prompt Injection: Direct"
    ),
    "prompt_injection_indirect": MitreTag(
        framework="ATLAS", tactic="Execution", technique_id="AML.T0051.001", name="LLM Prompt Injection: Indirect"
    ),
    "agent_tool_invocation": MitreTag(
        framework="ATLAS", tactic="Execution", technique_id="AML.T0053", name="AI Agent Tool Invocation"
    ),
    "llm_jailbreak": MitreTag(
        framework="ATLAS", tactic="Privilege Escalation", technique_id="AML.T0054", name="LLM Jailbreak"
    ),
    "llm_data_leakage": MitreTag(
        framework="ATLAS",
        tactic="Exfiltration",
        technique_id="AML.T0086",
        name="Exfiltration via AI Agent Tool Invocation",
    ),
    "prompt_obfuscation": MitreTag(
        framework="ATLAS", tactic="Defense Evasion", technique_id="AML.T0068", name="LLM Prompt Obfuscation"
    ),
}

# Kill-chain order for the incident detail strip.
TACTIC_ORDER = [
    "Credential Access",
    "Initial Access",
    "Lateral Movement",
    "Stealth",  # ATT&CK's name for TA0005 since v20 (was "Defense Evasion")
    "Defense Evasion",  # still the ATLAS name (AML.TA0007)
    "Execution",
    "Privilege Escalation",
    "Exfiltration",
    "Impact",
]


def tag(key: str) -> MitreTag:
    """Look up a technique by key. Raises KeyError for unknown keys on purpose."""
    return MITRE[key]
