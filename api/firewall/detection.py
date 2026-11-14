"""Calls into Miles's AI detectors, wrapped so they FAIL CLOSED. OWNER: Ethan (P1).

Any exception, timeout or malformed result counts as "flagged" with failed=True, and the firewall
then blocks sensitive actions. The detectors are looked up at call time (detectors.scan_injection)
so tests and the "detectors OFF" proof can swap them.
"""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass

import detectors
from schemas.kairos import Detection

logger = logging.getLogger("api.firewall")


def _timeout() -> float:
    try:
        return float(os.getenv("FIREWALL_DETECTOR_TIMEOUT", "10"))
    except ValueError:
        return 10.0


@dataclass(frozen=True)
class DetectorOutcome:
    detection: Detection
    failed: bool = False  # the detector errored: treated as flagged

    @property
    def flagged(self) -> bool:
        return self.failed or self.detection.flagged


OFF = DetectorOutcome(Detection(flagged=False, confidence=0.0, explanation="AI detectors are turned off for this run."))


def _failed(what: str, err: BaseException) -> DetectorOutcome:
    logger.warning("firewall: %s failed (%s), failing closed", what, type(err).__name__)
    return DetectorOutcome(
        Detection(
            flagged=True,
            confidence=1.0,
            technique="detector_error",
            explanation=f"The {what} could not run, so Kairos treated this as unsafe.",
        ),
        failed=True,
    )


async def _call(what: str, coro) -> DetectorOutcome:
    try:
        result = await asyncio.wait_for(coro, timeout=_timeout())
        detection = result if isinstance(result, Detection) else Detection.model_validate(result)
    except Exception as e:  # noqa: BLE001 - fail closed on anything
        return _failed(what, e)
    return DetectorOutcome(detection)


async def scan(text: str, *, enabled: bool = True) -> DetectorOutcome:
    if not enabled:
        return OFF
    return await _call("injection scanner", detectors.scan_injection(text))


async def intent(user_request: str, proposed_action: dict, *, enabled: bool = True) -> DetectorOutcome:
    if not enabled:
        return OFF
    return await _call("intent check", detectors.check_intent(user_request, proposed_action))


def is_obfuscation(d: Detection) -> bool:
    t = (d.technique or "").lower()
    return any(w in t for w in ("obfusc", "encod", "base64", "homoglyph", "zero-width", "invisible"))


def is_jailbreak(d: Detection) -> bool:
    t = (d.technique or "").lower()
    return any(w in t for w in ("jailbreak", "role", "persona", "dan", "developer mode"))
