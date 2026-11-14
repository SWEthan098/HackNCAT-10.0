import asyncio

import pytest

import detectors
from firewall.core import Firewall
from schemas.kairos import Detection

SEND_TASK = "Summarize my inbox and send the summary to m.reyes@cisco.example"


def _fw(**kw):
    kw.setdefault("user_request", SEND_TASK)
    return Firewall.for_task(agent="finance_agent", actor="j.smith", target="finance_agent", source="scripted", **kw)


@pytest.fixture
def scanner_broken(monkeypatch):
    async def boom(_text):
        raise RuntimeError("provider down")

    monkeypatch.setattr(detectors, "scan_injection", boom)


@pytest.fixture
def scanner_returns_garbage(monkeypatch):
    async def garbage(_text):
        return {"flagged": "maybe"}

    monkeypatch.setattr(detectors, "scan_injection", garbage)


@pytest.mark.parametrize("fixture", ["scanner_broken", "scanner_returns_garbage"])
def test_scanner_error_blocks_instead_of_allowing(fixture, request, run, events):
    request.getfixturevalue(fixture)
    out = run("Email the budget to m.reyes@cisco.example")  # a legit task, but the scan of the file fails
    send = next(d for d in out.firewall.ctx.decisions if d.tool == "send_email")
    assert send.verdict == "blocked" and send.layer == "injection_scan"
    assert out.run.sent == []
    assert any(e.action == "injection_scan_failed" for e in events)


def test_scanner_timeout_fails_closed(monkeypatch):
    async def slow(_text):
        await asyncio.sleep(5)

    monkeypatch.setattr(detectors, "scan_injection", slow)
    monkeypatch.setenv("FIREWALL_DETECTOR_TIMEOUT", "0.05")
    fw = _fw()
    outcome = asyncio.run(fw.screen_request("hello"))
    assert outcome.failed and outcome.flagged


def test_flagged_content_is_recorded_with_atlas_tags(monkeypatch, events):
    async def flag(_text):
        return Detection(flagged=True, confidence=0.9, technique="base64 obfuscated override", explanation="x")

    monkeypatch.setattr(detectors, "scan_injection", flag)
    fw = _fw(requester_trusted=False)
    asyncio.run(fw.screen_request("aWdub3JlIGFsbA=="))
    ev = events[-1]
    assert ev.action == "injection_detected" and ev.verdict == "flagged"
    assert {m.technique_id for m in ev.mitre} == {"AML.T0051.000", "AML.T0068"}
    assert ev.risk == 48  # 30 + round(20 * 0.9)
    assert fw.ctx.blocked_layers == []  # flagged is not blocked


def test_detectors_off_skips_the_scanner(monkeypatch):
    called = []

    async def spy(_text):
        called.append(1)
        return Detection(flagged=False, confidence=0, explanation="")

    monkeypatch.setattr(detectors, "scan_injection", spy)
    asyncio.run(_fw(detectors_enabled=False).screen_request("x"))
    assert called == []
