"""Accounts under watch (sensors/watch.py). OWNER: Miles (P2)."""

from __future__ import annotations

import asyncio

from redteam import chain, playground
from sensors import comms_guard, watch
from sensors.comms_guard import handle_message
from sensors.login_guard import handle_login

TAKEOVER = {
    "failed_attempts": 8,
    "attempts_per_minute": 12,
    "avg_keystroke_interval_ms": 95,
    "keystroke_interval_stddev_ms": 22,
    "accounts_from_source": 1,
    "success_after_failures": True,
}
HUMAN = {**TAKEOVER, "failed_attempts": 1, "attempts_per_minute": 2, "success_after_failures": True}
WIRE = "This is Marcus Vale, CFO. I need you to wire $5,000 to our vendor today. I'll send the paperwork after."
PHISH = "Your mailbox will be suspended. Click here http://cisco-helpdesk.example/login and confirm your password."
NORMAL = "Close starts Monday. Please have accruals posted by Wednesday noon."


def message(body, sender="j.smith", to="e.cruz", source="scripted", actor=None):
    coro = handle_message(
        sender=f"{sender}@cisco.example",
        to=f"{to}@cisco.example",
        body=body,
        source=source,
        actor=actor,
        use_model=False,
    )
    return asyncio.run(coro)


def test_a_suspected_takeover_puts_the_account_under_watch_without_locking_it():
    result = handle_login("j.smith", TAKEOVER, actor="bot:203.0.113.7", source="scripted")
    assert result.verdict == "flagged" and result.response == "slowed" and not result.locked
    assert result.risk == 45  # the rule does not change the score
    entry = watch.watched_account("j.smith", source="scripted", actor="j.smith")
    assert entry is not None and entry.by == "bot:203.0.113.7"
    assert "under watch" in result.detection.explanation and "still works" in result.detection.explanation


def test_one_mistyped_password_then_success_is_not_a_takeover():
    handle_login("j.smith", HUMAN, actor="client:abc", source="scripted")
    assert watch.watched() == []


def test_flagged_messages_from_a_watched_account_are_held_and_normal_ones_are_not():
    assert message(WIRE).response == "slowed"  # before the takeover: delivered with a warning
    handle_login("j.smith", TAKEOVER, actor="bot:203.0.113.7", source="scripted")

    held = message(WIRE)
    assert held.response == "challenged" and held.verdict == "flagged" and held.message_id is None
    assert (held.risk, held.level) == (50, "medium")  # same score, tougher response
    assert "under watch" in held.detection.explanation and held.event.action == "message_challenged"
    assert message(PHISH).response == "challenged"  # not only money: any flagged message
    assert message(NORMAL).response == "watched"  # ordinary work still goes through
    assert message(WIRE, sender="t.becker").response == "slowed"  # other accounts are unaffected


def test_a_source_that_took_one_account_is_challenged_on_the_next():
    bot = "bot:203.0.113.7"
    quiet = {**TAKEOVER, "failed_attempts": 0, "attempts_per_minute": 1, "success_after_failures": False}
    assert handle_login("e.cruz", quiet, actor=bot, source="scripted").response == "watched"
    handle_login("j.smith", TAKEOVER, actor=bot, source="scripted")
    lateral = handle_login("e.cruz", quiet, actor=bot, source="scripted")
    assert lateral.response == "challenged" and lateral.risk == 0
    assert "already got into another account" in lateral.detection.explanation
    assert handle_login("j.smith", quiet, actor=bot, source="scripted").response == "watched"  # not a new account
    assert handle_login("e.cruz", quiet, actor="client:someone-else", source="scripted").response == "watched"


def test_judges_and_the_scripted_chain_never_affect_each_other():
    handle_login("guest05", TAKEOVER, actor="judge:falcon", source="audience")
    assert (
        message(WIRE, sender="guest05", to="guest06", source="audience", actor="judge:falcon").response == "challenged"
    )
    assert message(WIRE, sender="guest05", to="guest06", source="audience", actor="judge:hawk").response == "slowed"
    assert message(WIRE, sender="guest05", to="guest06", source="scripted").response == "slowed"
    handle_login("j.smith", TAKEOVER, actor="bot:203.0.113.7", source="scripted")
    assert message(WIRE, sender="j.smith", source="audience", actor="judge:falcon").response == "slowed"


def test_reset_and_clear_end_the_watch():
    handle_login("j.smith", TAKEOVER, actor="bot:203.0.113.7", source="scripted")
    assert watch.clear("j.smith") == 1 and message(WIRE).response == "slowed"
    handle_login("j.smith", TAKEOVER, actor="bot:203.0.113.7", source="scripted")
    comms_guard.reset_messages()  # what Reset demo calls
    assert watch.watched() == [] and message(WIRE).response == "slowed"


def test_attack_picker_full_attack_holds_the_fake_boss_after_a_real_takeover():
    weak = next(g.username for g in playground.GUESTS if g.password in playground.COMMON_PASSWORDS[:5])
    names = (f"judge{i}" for i in range(2000))
    nick = next(n for n in names if playground._guests_for(playground.actor_for(n), 1) == [weak])
    result = asyncio.run(playground.launch("fake_boss", {"pressure": "urgent"}, nick))
    assert result.response_level == "slowed"  # no takeover yet
    cracked = asyncio.run(playground.launch("password_guessing", {"speed": "slow"}, nick))
    assert "got into 1 sandbox account" in cracked.outcome
    after = asyncio.run(playground.launch("fake_boss", {"pressure": "urgent"}, nick))
    assert after.response_level == "challenged" and after.risk == result.risk


def test_the_chain_can_be_run_again_without_a_reset():
    first = asyncio.run(chain.run("full_chain", "protected"))
    second = asyncio.run(chain.run("full_chain", "protected"))
    assert first.outcome == second.outcome == "blocked"
    assert [e.risk for e in second.events] == [45, 50, 55]
