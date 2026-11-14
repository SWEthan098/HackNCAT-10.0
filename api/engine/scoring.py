"""Risk scoring. OWNER: Daylen (P3). Code decides the score and level, never an AI.

Every threshold lives in this file so it can be tuned in one place.
"""

from __future__ import annotations

from schemas.kairos import Level

# Low 0-29, Medium 30-59, High 60-84, Critical 85-100. Highest floor first.
LEVEL_THRESHOLDS: list[tuple[int, Level]] = [(85, "critical"), (60, "high"), (30, "medium"), (0, "low")]
# Incident risk = highest linked event + this much for each extra listener involved.
EXTRA_SENSOR_BONUS = 15
MAX_RISK = 100


def clamp_risk(risk: int) -> int:
    return max(0, min(MAX_RISK, int(risk)))


def score_to_level(risk: int) -> Level:
    risk = clamp_risk(risk)
    for floor, level in LEVEL_THRESHOLDS:
        if risk >= floor:
            return level
    return "low"


def incident_risk(event_risks: list[int], sensor_count: int) -> int:
    """Highest linked event risk + 15 for each extra listener involved, capped at 100."""
    if not event_risks:
        return 0
    return min(MAX_RISK, max(event_risks) + EXTRA_SENSOR_BONUS * max(0, sensor_count - 1))


def risk_math(event_risks: list[int], sensor_count: int) -> str:
    """The score shown to humans, e.g. '55 + 15 x 2 extra listeners = 85'. Facts only."""
    if not event_risks:
        return "0"
    extra = max(0, sensor_count - 1)
    total = incident_risk(event_risks, sensor_count)
    if extra == 0:
        return str(total)
    capped = " (capped)" if max(event_risks) + EXTRA_SENSOR_BONUS * extra > MAX_RISK else ""
    plural = "s" if extra != 1 else ""
    return f"{max(event_risks)} + {EXTRA_SENSOR_BONUS} x {extra} extra listener{plural} = {total}{capped}"
