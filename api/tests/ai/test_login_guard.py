"""Login Guard tests (checklist step 5, plus the step 14 fairness check). OWNER: Miles (P2)."""

from __future__ import annotations

import pytest

from detectors import score_login
from detectors.login import FEATURE_KEYS, clean_features, login_risk
from redteam import seed
from sensors.login_guard import LOCKED_MESSAGE, USER_MESSAGES, handle_login, is_locked

HUMAN = {
    "failed_attempts": 1,
    "attempts_per_minute": 2,
    "avg_keystroke_interval_ms": 210,
    "keystroke_interval_stddev_ms": 80,
    "accounts_from_source": 1,
    "success_after_failures": False,
}
BOT = {
    "failed_attempts": 30,
    "attempts_per_minute": 60,
    "avg_keystroke_interval_ms": 4,
    "keystroke_interval_stddev_ms": 0.5,
    "accounts_from_source": 1,
    "success_after_failures": False,
}
LOUD_BOT = {**BOT, "failed_attempts": 200, "attempts_per_minute": 300, "accounts_from_source": 20}
SNEAKY_BOT = {
    "failed_attempts": 3,
    "attempts_per_minute": 2,
    "avg_keystroke_interval_ms": 190,
    "keystroke_interval_stddev_ms": 60,
    "accounts_from_source": 3,
    "success_after_failures": False,
}
# Password manager, paste or a screen reader filling the field: instant, perfectly even "typing".
ASSISTIVE_TECH = {**HUMAN, "failed_attempts": 0, "avg_keystroke_interval_ms": 0, "keystroke_interval_stddev_ms": 0}


class _Rows:
    def __init__(self, data):
        self.data = data


class _EntityQuery:
    def __init__(self, locked: set[str], fail: bool):
        self._locked, self._fail, self._entity = locked, fail, None

    def select(self, *_a):
        return self

    def eq(self, _col, value):
        self._entity = value
        return self

    def limit(self, _n):
        return self

    def execute(self):
        if self._fail:
            raise RuntimeError("database down")
        return _Rows([{"locked": self._entity in self._locked}])


class _Db:
    def __init__(self, locked=(), fail=False):
        self.locked, self.fail = set(locked), fail

    def table(self, name):
        assert name == "entity_state"
        return _EntityQuery(self.locked, self.fail)


def guard(features, username="guest01", **kw):
    return handle_login(username, features, actor="bot:test", source="audience", **kw)


# ---- scoring ---------------------------------------------------------------------------


def test_normal_human_scores_low():
    result = guard(HUMAN)
    assert result.level == "low" and result.risk < 30
    assert result.verdict == "allowed" and result.response == "watched"
    assert not result.detection.flagged


def test_bot_pattern_scores_high():
    result = guard(BOT)
    assert result.level == "high" and 60 <= result.risk < 85
    assert result.response == "challenged" and result.verdict == "flagged"
    assert result.detection.technique == "credential stuffing"


def test_ladder_is_proportionate_sneaky_watched_loud_blocked():
    assert guard(SNEAKY_BOT).response == "watched"
    assert guard({**BOT, "failed_attempts": 6, "attempts_per_minute": 25, "avg_keystroke_interval_ms": 200,
                  "keystroke_interval_stddev_ms": 50}).response == "slowed"  # fmt: skip
    assert guard(BOT).response == "challenged"
    loud = guard(LOUD_BOT)
    assert loud.response == "blocked" and loud.verdict == "blocked" and loud.level == "critical"


def test_success_right_after_many_failures_is_a_big_jump():
    before = login_risk({**HUMAN, "failed_attempts": 8, "attempts_per_minute": 12})
    after = login_risk({**HUMAN, "failed_attempts": 8, "attempts_per_minute": 12, "success_after_failures": True})
    assert after.risk - before.risk >= 20
    assert after.technique == "account takeover"
    # One mistyped password then success is just a person.
    assert login_risk({**HUMAN, "success_after_failures": True}).risk < 30


def test_every_seeded_normal_login_scores_low():
    assert set(seed.FEATURE_KEYS) == set(FEATURE_KEYS)
    for row in seed.normal_login_history():
        assert login_risk(row["features"]).risk < 30, row


def test_score_math_is_shown():
    detection = score_login(BOT)
    assert detection.flagged and detection.confidence == pytest.approx(0.6)
    assert "25 + 20 + 15 = 60" in detection.explanation


# ---- fairness and privacy --------------------------------------------------------------


def test_assistive_tech_and_autofill_are_not_flagged_as_bots():
    result = guard(ASSISTIVE_TECH)
    assert result.level == "low" and result.verdict == "allowed" and not result.detection.flagged
    assert "assistive tech" in result.detection.explanation
    # Even with a couple of mistyped attempts first.
    assert guard({**ASSISTIVE_TECH, "failed_attempts": 2}).level == "low"


def test_wording_asks_to_verify_and_never_accuses():
    for message in (*USER_MESSAGES.values(), LOCKED_MESSAGE):
        lowered = message.lower()
        assert not any(word in lowered for word in ("bot", "attack", "hacker", "suspicious", "fraud"))
    assert "verify" in USER_MESSAGES["challenged"] and "verify" in USER_MESSAGES["blocked"]


def test_typed_content_is_dropped_before_scoring():
    dirty = {**HUMAN, "password": "hunter2", "typed_text": "my secret", "keys": ["h", "u"], "failed_attempts": "9"}
    cleaned = clean_features(dirty)
    assert set(cleaned) <= set(FEATURE_KEYS)
    result = guard(dirty)
    assert "hunter2" not in result.detection.explanation and "my secret" not in result.event.reason
    assert clean_features({"failed_attempts": -5, "attempts_per_minute": float("nan")}).keys() == {
        "success_after_failures"
    }
    assert login_risk(None).risk == 0 and login_risk({"typing_ms": 120}).risk == 0


# ---- locked accounts and events --------------------------------------------------------


def test_locked_account_answers_account_locked_even_for_a_normal_login():
    result = guard(HUMAN, username="j.smith", db=_Db(locked={"j.smith"}))
    assert result.locked and result.verdict == "blocked"
    assert result.user_message.startswith("Account locked")
    assert result.level == "high" and result.event.action == "login_blocked_account_locked"
    assert not guard(HUMAN, username="guest02", db=_Db(locked={"j.smith"})).locked


def test_database_failure_never_locks_anyone_out():
    assert is_locked(_Db(fail=True), "j.smith") is False
    assert is_locked(None, "j.smith") is False
    assert guard(HUMAN, db=_Db(fail=True)).verdict == "allowed"
    assert guard(LOUD_BOT, db=_Db(fail=True)).verdict == "blocked"  # scoring still protects


def test_events_carry_actor_target_source_and_mitre_from_the_table():
    result = handle_login(
        "j.smith", {**BOT, "success_after_failures": True}, actor="bot:203.0.113.7", source="scripted"
    )
    event = result.event
    assert (event.sensor, event.actor, event.target, event.source) == (
        "login_guard",
        "bot:203.0.113.7",
        "j.smith",
        "scripted",
    )
    assert event.risk == result.risk and event.level == result.level
    assert [m.technique_id for m in event.mitre] == ["T1110.004", "T1078"]
    assert guard(HUMAN).event.mitre == []


def test_ordinary_low_logins_are_not_recorded_when_asked_not_to():
    assert guard(HUMAN, record_low=False).event is None
    assert guard(BOT, record_low=False).event is not None


# ---- endpoint --------------------------------------------------------------------------


def test_public_endpoint_scores_without_a_login(client):
    r = client.post("/sensors/login", json={"username": "guest01", "features": HUMAN})
    assert r.status_code == 200 and r.json()["verdict"] == "allowed"
    r = client.post("/sensors/login", json={"username": "guest01", "features": LOUD_BOT})
    body = r.json()
    assert body["verdict"] == "blocked" and body["detection"]["flagged"] is True
    assert body["detection"]["technique"] == "credential stuffing"
