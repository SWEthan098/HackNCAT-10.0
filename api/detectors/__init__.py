"""AI detectors. OWNER: Miles (P2).

Every detector returns schemas.kairos.Detection. scan_injection (detectors/injection.py),
score_login (detectors/login.py) and classify_message (detectors/comms.py) are real; check_intent
is still a STUB so P1 and P3 can import it today. Fail closed: if the model output can't be parsed, return
flagged=True. Uses services.ai (provider-neutral) for model calls.
"""

from __future__ import annotations

from detectors.comms import classify_message, classify_message_mock
from detectors.injection import mitre_keys, scan_injection, scan_injection_mock
from detectors.login import score_login
from schemas.kairos import Detection

__all__ = [
    "check_intent",
    "classify_message",
    "classify_message_mock",
    "mitre_keys",
    "scan_injection",
    "scan_injection_mock",
    "score_login",
]


async def check_intent(user_request: str, proposed_action: dict) -> Detection:
    return Detection(flagged=False, confidence=0.0, technique=None, explanation="stub: intent check not built yet")
