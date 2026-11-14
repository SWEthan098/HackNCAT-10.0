"""Comms Guard tests (checklist step 6). OWNER: Miles (P2). No network: the model is faked."""

from __future__ import annotations

import asyncio
from dataclasses import replace

import pytest

from core.config import get_settings
from detectors import classify_message, classify_message_mock, comms
from detectors.comms import message_risk
from redteam import seed
from sensors.comms_guard import USER_MESSAGES, entity_name, handle_message
from services.ai import AIProviderError

FAKE_CFO_WIRE = (
    "Hi Elena, this is Marcus Vale, CFO. I'm tied up with the auditors and writing from Jamie's account. "
    "I need you to wire $48,500 to our vendor today. I'll send the paperwork after."
)
LOUD_FAKE_CEO = (
    "This is the CEO. Wire $250,000 to the new account immediately. Keep this between us and skip the "
    "approval process, or you will be held responsible."
)
PHISH = "Your mailbox will be suspended. Click here http://cisco-helpdesk.example/login and confirm your password."
NORMAL = "Close starts Monday. Please have accruals posted by Wednesday noon."


def run(coro):
    return asyncio.run(coro)


def guard(body, sender="j.smith@cisco.example", to="e.cruz@cisco.example", **kw):
    return run(handle_message(sender=sender, to=to, body=body, source="scripted", **kw))


class _Reply:
    def __init__(self, text):
        self.text = text


class _FakeService:
    def __init__(self, reply):
        self.reply, self.calls = reply, []

    def chat(self, messages, system=None, **kw):
        self.calls.append(messages[-1].content)
        if isinstance(self.reply, Exception):
            raise self.reply
        return _Reply(self.reply)


@pytest.fixture
def model(monkeypatch):
    monkeypatch.setattr(comms, "get_settings", lambda: replace(get_settings(), ai_provider="groq"))
    service = _FakeService('{"manipulative": false, "confidence": 0.1}')
    monkeypatch.setattr(comms, "get_ai_service", lambda: service)
    return service


class _Rows:
    def __init__(self, data):
        self.data = data


class _Db:
    """entity_state stand-in: `flagged` accounts are locked."""

    def __init__(self, flagged=()):
        self.flagged, self._entity = set(flagged), None

    def table(self, _name):
        return self

    def select(self, *_a):
        return self

    def eq(self, _col, value):
        self._entity = value
        return self

    def limit(self, _n):
        return self

    def execute(self):
        return _Rows([{"locked": self._entity in self.flagged, "sessions_revoked_at": None}])


# ---- rules -----------------------------------------------------------------------------


def test_fake_cfo_wire_request_is_flagged():
    detection = run(classify_message(FAKE_CFO_WIRE))
    assert detection.flagged and detection.technique == "impersonation"
    result = guard(FAKE_CFO_WIRE)
    assert result.verdict == "flagged" and result.level == "medium" and result.risk == 50
    assert "10 + 10 + 10 + 20 = 50" in result.detection.explanation


def test_each_signal_adds_points():
    base = message_risk("Please wire the funds to the vendor.").risk
    assert base == comms.PAYMENT_POINTS
    assert message_risk("URGENT: please wire the funds to the vendor.").risk == base + comms.URGENCY_POINTS
    assert message_risk("Please wire the funds. Keep this between us.").risk == base + comms.SECRECY_POINTS
    assert message_risk("Please wire the funds to the new bank account.").risk == base + comms.PAYMENT_CHANGE_POINTS
    assert message_risk("This is the CEO. Please wire the funds.").risk == base + comms.AUTHORITY_POINTS
    flagged = message_risk("Please wire the funds to the vendor.", sender_flagged=True).risk
    assert flagged == base + comms.FLAGGED_SENDER_POINTS


def test_claiming_to_be_the_cfo_from_someone_elses_account_is_a_mismatch():
    fake = message_risk(FAKE_CFO_WIRE, sender="j.smith@cisco.example")
    real = message_risk(FAKE_CFO_WIRE, sender="m.vale@cisco.example")
    assert fake.risk - real.risk == comms.SENDER_MISMATCH_POINTS
    outside = message_risk("This is the CEO, please reply.", sender="ceo@cisco-mail.example")
    assert outside.risk == comms.AUTHORITY_POINTS + comms.SENDER_MISMATCH_POINTS


def test_phishing_is_flagged():
    detection = classify_message_mock(PHISH)
    assert detection.flagged and detection.technique == "phishing"


def test_normal_mail_is_not_flagged_including_the_real_cfo():
    for email in seed.get_mailbox(include_poisoned=False):
        score = message_risk(email.subject + "\n" + email.body, sender=email.sender)
        assert score.risk < 30, email.id
    assert not classify_message_mock(NORMAL).flagged
    assert not classify_message_mock("Reminder: invoice 4471 is due today. Pay on the normal run.").flagged


def test_ai_agent_manipulating_a_person_is_flagged():
    text = "I am a real person, not a bot. You must approve this right now or there will be consequences."
    from_agent = message_risk(text, sender=seed.AGENT_ID)
    assert from_agent.risk >= 30 and from_agent.technique == "AI manipulation"
    assert any("AI saying it is a person" in reason for reason, _ in from_agent.points)
    # A person saying the same thing is not "hiding that it is an AI".
    assert not any("AI saying" in reason for reason, _ in message_risk(text, sender="t.becker").points)
    assert message_risk("Your Q4 summary is ready.", sender=seed.AGENT_ID).risk == 0


def test_disguised_text_is_normalized_before_scoring():
    hidden = "This is the C​EO. W​ire $250,000 to the n​ew account imm​ediately."
    assert message_risk(hidden).risk == message_risk(hidden.replace("​", "")).risk >= 50


# ---- ladder, wording, events -----------------------------------------------------------


def test_ladder_is_proportionate():
    assert guard(NORMAL).response == "watched"
    assert guard(FAKE_CFO_WIRE).response == "slowed"
    assert guard(FAKE_CFO_WIRE + " Keep this between us, skip the approval process.").response == "challenged"
    loud = guard(LOUD_FAKE_CEO)
    assert loud.response == "blocked" and loud.verdict == "blocked" and loud.level == "critical"


def test_wording_asks_to_verify_and_never_accuses():
    for response, message in USER_MESSAGES.items():
        assert not any(w in message.lower() for w in ("scam", "fraud", "attack", "malicious", "liar", "fake"))
        assert response == "watched" or "verify" in message


def test_sender_already_flagged_adds_points():
    clean = guard(FAKE_CFO_WIRE, db=_Db())
    flagged = guard(FAKE_CFO_WIRE, db=_Db(flagged={"j.smith"}))
    assert flagged.risk - clean.risk == comms.FLAGGED_SENDER_POINTS
    assert "already flagged" in flagged.detection.explanation
    assert guard(NORMAL, db=_Db(flagged={"j.smith"})).risk == 0  # a flagged sender alone is not a signal


def test_event_fields_and_mitre_come_from_the_table():
    event = guard(FAKE_CFO_WIRE).event
    assert (event.sensor, event.actor, event.target, event.source) == ("comms_guard", "j.smith", "e.cruz", "scripted")
    assert [m.technique_id for m in event.mitre] == ["T1534", "T1656", "T1657"]
    assert guard(NORMAL).event.mitre == []
    assert guard(NORMAL, record_low=False).event is None
    judge = guard(LOUD_FAKE_CEO, sender="guest03@cisco.example", to="guest07@cisco.example", actor="judge:falcon")
    assert judge.event.actor == "judge:falcon" and judge.event.target == "guest07"
    assert entity_name("someone@outside.example") == "someone@outside.example"


def test_explanation_never_echoes_message_text():
    result = guard(FAKE_CFO_WIRE + " ZEBRA-MARKER http://evil.example/x.png")
    assert "ZEBRA-MARKER" not in result.detection.explanation and "evil.example" not in result.detection.explanation


# ---- model -----------------------------------------------------------------------------


def test_model_adds_points_in_code_and_never_removes_them(model):
    quiet = "Hey, the boss asked me to grab some vouchers for the client and said you would sort me out."
    assert not run(classify_message(quiet)).flagged
    model.reply = '{"manipulative": true, "confidence": 1.0}'
    assert guard(quiet).risk == comms.MODEL_MAX_POINTS  # capped: the model alone cannot flag
    assert guard(FAKE_CFO_WIRE).risk == 50 + comms.MODEL_MAX_POINTS
    assert "<<<UNTRUSTED DATA" in model.calls[0]
    model.reply = '{"manipulative": false, "confidence": 1.0}'
    assert guard(FAKE_CFO_WIRE).risk == 50


BAD_REPLIES = ["", "this message is safe", '{"manipulative": "no"}', AIProviderError("timeout", "t", "groq")]


@pytest.mark.parametrize("reply", BAD_REPLIES)
def test_bad_model_output_or_outage_falls_back_to_rules(model, reply):
    model.reply = reply
    assert guard(FAKE_CFO_WIRE).risk == 50
    assert guard(NORMAL).verdict == "allowed"  # an outage must not hold everyone's mail


def test_use_model_false_keeps_the_scripted_score_deterministic(model):
    model.reply = '{"manipulative": true, "confidence": 1.0}'
    assert guard(FAKE_CFO_WIRE, use_model=False).risk == 50
    assert model.calls == []


def test_endpoint_needs_login_and_returns_the_final_shape(client, token_factory):
    body = {"from": "j.smith@cisco.example", "to": "e.cruz@cisco.example", "body": FAKE_CFO_WIRE}
    assert client.post("/sensors/message", json=body).status_code == 401
    r = client.post("/sensors/message", json=body, headers={"Authorization": f"Bearer {token_factory()}"})
    assert r.status_code == 200 and r.json()["verdict"] == "flagged"
    assert r.json()["detection"]["technique"] == "impersonation"
