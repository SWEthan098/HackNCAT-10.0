"""Kairos benchmark (checklist step 13). OWNER: Miles (P2).

Runs offline and deterministically (no model, no network, no database), so CI can run it on every
push. The numbers are printed at the end of the pytest run by tests/benchmarks/conftest.py.
Thresholds here are floors, not targets: a real miss stays a miss in the report.
"""

from __future__ import annotations

import asyncio
import statistics
import time

import engine
from detectors import scan_injection_mock
from detectors.comms import message_risk
from detectors.injection import OBFUSCATION
from detectors.login import login_risk
from redteam import chain, playground, seed
from tests.benchmarks import corpus, report


def test_injection_scanner_catch_rate_false_positives_and_latency():
    groups: dict[str, tuple[int, int]] = {}
    timings: list[float] = []

    def scan(text: str):
        start = time.perf_counter()
        detection = scan_injection_mock(text)
        timings.append((time.perf_counter() - start) * 1000)
        return detection

    for name, attacks in corpus.ATTACKS.items():
        groups[name] = (sum(scan(text).flagged for text in attacks), len(attacks))
    labelled = sum(scan_injection_mock(text).technique == OBFUSCATION for text in corpus.OBFUSCATED)
    false_positives = sum(scan(text).flagged for text in corpus.NORMAL)
    total = sum(n for _, n in groups.values())
    caught = sum(hit for hit, _ in groups.values())
    timings.sort()

    report.RESULTS["scanner"] = {
        "groups": groups,
        "attacks": total,
        "caught": caught,
        "normal": len(corpus.NORMAL),
        "false_positives": false_positives,
        "obfuscation_labelled": labelled,
        "mean_ms": statistics.fmean(timings),
        "p95_ms": timings[int(0.95 * (len(timings) - 1))],
    }

    assert len(corpus.INJECTIONS) == 30
    assert caught / total >= 0.90
    assert groups["safe_trick"][0] == groups["safe_trick"][1]  # "this message is safe" never works
    assert labelled == len(corpus.OBFUSCATED)
    assert false_positives / len(corpus.NORMAL) <= 0.05


def test_login_guard_bots_versus_normal_and_assistive_tech():
    bots = [
        {"failed_attempts": f, "attempts_per_minute": r, "avg_keystroke_interval_ms": 4,
         "keystroke_interval_stddev_ms": 1, "accounts_from_source": a, "success_after_failures": False}
        for f, r, a in [(20, 30, 1), (60, 120, 1), (200, 120, 10), (100, 60, 5), (40, 30, 4), (15, 25, 2)]
    ]  # fmt: skip
    normal = [row["features"] for row in seed.normal_login_history()]
    # Autofill, paste and screen readers: instant, perfectly even "typing", sometimes after a mistype.
    assistive = [
        {"failed_attempts": failed, "attempts_per_minute": 1 + failed, "avg_keystroke_interval_ms": avg,
         "keystroke_interval_stddev_ms": 0, "accounts_from_source": 1, "success_after_failures": failed > 0}
        for failed in (0, 1, 2) for avg in (0, 3, 12)
    ]  # fmt: skip
    bots_flagged = sum(login_risk(f).risk >= 30 for f in bots)
    false_positives = sum(login_risk(f).risk >= 30 for f in normal + assistive)
    report.RESULTS["login"] = {
        "bots": len(bots),
        "bots_flagged": bots_flagged,
        "normal": len(normal) + len(assistive),
        "false_positives": false_positives,
    }
    assert bots_flagged == len(bots)
    assert false_positives == 0


def test_comms_guard_fake_boss_versus_normal_mail():
    attacks = [
        playground.fake_boss_message(role, amount, pressure)
        for role in playground.ROLES
        for pressure in ("urgent", "threatening")
        for amount in (4_800, 250_000)
    ] + [chain.FAKE_CFO_MESSAGE]
    flagged = sum(message_risk(text, sender="guest01@cisco.example").risk >= 30 for text in attacks)
    mailbox = seed.get_mailbox(include_poisoned=False)
    false_positives = sum(message_risk(m.subject + "\n" + m.body, sender=m.sender).risk >= 30 for m in mailbox)
    report.RESULTS["comms"] = {
        "attacks": len(attacks),
        "flagged": flagged,
        "normal": len(mailbox),
        "false_positives": false_positives,
    }
    assert flagged == len(attacks)
    assert false_positives == 0


def test_chain_with_and_without_kairos():
    unprotected = asyncio.run(chain.run("full_chain", "unprotected"))
    protected = asyncio.run(chain.run("full_chain", "protected"))
    risks = [e.risk for e in protected.events]
    incident = engine.incident_risk(risks, len({e.sensor for e in protected.events}))
    report.RESULTS["chain"] = {
        "unprotected": f"{unprotected.outcome} (payroll left the company, nothing recorded)",
        "protected": protected.outcome,
        "risks": risks,
        "incident": incident,
        "level": engine.score_to_level(incident),
    }
    assert unprotected.outcome == "leaked" and protected.outcome == "blocked"
    assert all(engine.score_to_level(r) == "medium" for r in risks)  # each listener alone only says Medium
    assert incident == 85
