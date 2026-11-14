"""AI detectors. OWNER: Miles (P2).

Every detector returns schemas.kairos.Detection. These are STUBS so P1 and P3 can import them
today; replace the bodies with real logic. Fail closed: if the model output can't be parsed,
return flagged=True. Uses services.ai (provider-neutral) for model calls.
"""

from __future__ import annotations

from schemas.kairos import Detection


async def scan_injection(text: str) -> Detection:
    return Detection(flagged=False, confidence=0.0, technique=None, explanation="stub: scanner not built yet")


async def check_intent(user_request: str, proposed_action: dict) -> Detection:
    return Detection(flagged=False, confidence=0.0, technique=None, explanation="stub: intent check not built yet")


async def classify_message(message: str) -> Detection:
    return Detection(flagged=False, confidence=0.0, technique=None, explanation="stub: classifier not built yet")


def score_login(features: dict) -> Detection:
    return Detection(flagged=False, confidence=0.0, technique=None, explanation="stub: login scoring not built yet")
