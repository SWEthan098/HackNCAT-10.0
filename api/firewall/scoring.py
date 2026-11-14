"""Firewall risk points. OWNER: Ethan (P1). Code scores, never AI.

Levels come from engine.score_to_level (Daylen's single source of thresholds). AI detectors only
contribute a confidence; the conversion to points happens here.
"""

from __future__ import annotations

ALLOWED_READ = 0
ALLOWED_SEND = 10
POLICY_VIOLATION = 40  # the human asked for something the policy forbids (no attacker involved)
BLOCKED_HIJACK = 55  # untrusted input drove a sensitive action and it was blocked; nothing leaked
SENSITIVE_DATA_BLOCKED = 70  # payroll/secrets caught in a tool argument on the way out
LEAK_OR_CANARY = 100  # canary seen anywhere, or data actually left: automatically Critical
FROZEN_AGENT = 30  # containment doing its job
SCANNER_FAILURE = 60  # fail closed: unsure means a human looks


def injection_points(confidence: float) -> int:
    """A flagged injection on its own is Medium: 30 + up to 20 by detector confidence."""
    return 30 + round(20 * max(0.0, min(1.0, confidence)))
