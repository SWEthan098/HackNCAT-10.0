"""MITRE ATT&CK + ATLAS lookup table. OWNER: Daylen (P3). FROZEN after the scaffold merges.

Technique IDs come ONLY from this table, never from an LLM, so nothing gets made up on stage.
Before demo day, verify every ID on attack.mitre.org and atlas.mitre.org. Two are flagged:
- T1656 Impersonation: one mirror says it was replaced by T1684.001 in ATT&CK v19.
- AML.T0057 LLM Data Leakage: reportedly merged into another technique in ATLAS v2026.10.
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
    "impersonation": MitreTag(
        framework="ATTACK", tactic="Defense Evasion", technique_id="T1656", name="Impersonation (VERIFY ID)"
    ),
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
        framework="ATLAS", tactic="Exfiltration", technique_id="AML.T0057", name="LLM Data Leakage (VERIFY ID)"
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
    "Defense Evasion",
    "Execution",
    "Privilege Escalation",
    "Exfiltration",
    "Impact",
]


def tag(key: str) -> MitreTag:
    """Look up a technique by key. Raises KeyError for unknown keys on purpose."""
    return MITRE[key]
