"""Login scoring rules for Login Guard. OWNER: Miles (P2).

    detection = score_login(features)      # Detection; confidence is risk / 100
    score = login_risk(features)           # the same result with the points broken out

Pure code, no AI. Looks at timing and metadata only, never anything a person typed:

    failed_attempts               failed logins in the current burst
    attempts_per_minute           how fast attempts arrive
    avg_keystroke_interval_ms     average gap between key presses (no key values)
    keystroke_interval_stddev_ms  how even those gaps are
    accounts_from_source          how many different accounts one source tried
    success_after_failures        True if a login finally succeeded after the failures

Any other key is dropped before scoring, so typed content can never reach this code.

Fairness: instant or perfectly even "typing" alone (password managers, paste, screen readers and
other assistive tech) is NOT treated as a bot. It only adds real points next to volume signals.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from schemas.kairos import Detection

FEATURE_KEYS: tuple[str, ...] = (
    "failed_attempts",
    "attempts_per_minute",
    "avg_keystroke_interval_ms",
    "keystroke_interval_stddev_ms",
    "accounts_from_source",
    "success_after_failures",
)

CREDENTIAL_STUFFING = "credential stuffing"
ACCOUNT_TAKEOVER = "account takeover"

# (floor, points): the highest floor the value reaches wins. All tunable in one place.
FAILED_ATTEMPT_POINTS = ((50, 35), (10, 25), (5, 15), (2, 5))
RATE_POINTS = ((61, 30), (21, 20), (6, 10))  # attempts per minute
SOURCE_SPREAD_POINTS = ((10, 25), (4, 15), (2, 5))  # accounts tried from one source
SUCCESS_AFTER_FAILURES_POINTS = ((10, 25), (3, 20))  # keyed on failed attempts before the success
INHUMAN_TYPING_POINTS = 15  # only next to volume signals
INHUMAN_TYPING_ALONE_POINTS = 5  # autofill / paste / assistive tech look like this
INHUMAN_AVG_MS = 30.0
INHUMAN_STDDEV_MS = 5.0
FLAG_AT = 30  # Medium and above


@dataclass(frozen=True)
class LoginScore:
    risk: int  # 0-100
    points: tuple[tuple[str, int], ...]  # (plain-English reason, points) for the score math
    technique: str | None

    @property
    def math(self) -> str:
        if not self.points:
            return "0"
        total = sum(p for _, p in self.points)
        parts = " + ".join(str(p) for _, p in self.points)
        return f"{parts} = {total}" + (" (capped at 100)" if total > 100 else "")


def clean_features(features: dict[str, Any] | None) -> dict[str, float | bool]:
    """Keep only the known timing/metadata keys with sane numeric values. Everything else is dropped."""
    cleaned: dict[str, float | bool] = {}
    for key in FEATURE_KEYS:
        value = (features or {}).get(key)
        if key == "success_after_failures":
            cleaned[key] = value is True or (isinstance(value, str) and value.lower() == "true")
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value or value < 0:
            continue
        cleaned[key] = min(float(value), 1_000_000.0)
    return cleaned


def _tier(value: float, tiers: tuple[tuple[int, int], ...]) -> int:
    return next((points for floor, points in tiers if value >= floor), 0)


def login_risk(features: dict[str, Any] | None) -> LoginScore:
    f = clean_features(features)
    failed = f.get("failed_attempts", 0)
    rate = f.get("attempts_per_minute", 0)
    spread = f.get("accounts_from_source", 0)
    points: list[tuple[str, int]] = []

    if p := _tier(failed, FAILED_ATTEMPT_POINTS):
        points.append((f"{int(failed)} failed attempts", p))
    if p := _tier(rate, RATE_POINTS):
        points.append((f"{int(rate)} attempts per minute", p))
    if p := _tier(spread, SOURCE_SPREAD_POINTS):
        points.append((f"{int(spread)} accounts tried from one source", p))
    volume = bool(points)

    avg, stddev = f.get("avg_keystroke_interval_ms"), f.get("keystroke_interval_stddev_ms")
    inhuman = (avg is not None and avg < INHUMAN_AVG_MS) or (stddev is not None and stddev < INHUMAN_STDDEV_MS)
    if inhuman and volume:
        points.append(("typing rhythm faster or more even than a person", INHUMAN_TYPING_POINTS))
    elif inhuman:
        points.append(("instant typing only (normal for autofill and assistive tech)", INHUMAN_TYPING_ALONE_POINTS))

    takeover = False
    if f.get("success_after_failures") and (p := _tier(failed, SUCCESS_AFTER_FAILURES_POINTS)):
        points.append(("a login succeeded right after the failures", p))
        takeover = True

    risk = min(100, sum(p for _, p in points))
    technique = ACCOUNT_TAKEOVER if takeover else CREDENTIAL_STUFFING if volume else None
    return LoginScore(risk=risk, points=tuple(points), technique=technique)


def explain(score: LoginScore) -> str:
    if not score.points:
        return "Normal login behavior. Nothing unusual in timing or attempt counts."
    reasons = "; ".join(f"{reason} (+{p})" for reason, p in score.points)
    return f"Risk {score.risk}/100: {reasons}. Score math: {score.math}."


def score_login(features: dict) -> Detection:
    score = login_risk(features)
    return Detection(
        flagged=score.risk >= FLAG_AT,
        confidence=score.risk / 100,
        technique=score.technique if score.risk >= FLAG_AT else None,
        explanation=explain(score),
    )
