import asyncio
import base64

import pytest

from agents.victim import fixtures
from agents.victim.planner import SYSTEM_PROMPT
from agents.victim.tools import Workspace
from firewall.core import Firewall
from firewall.vault import DEFAULT_VAULT_CODE, canary_hit, canary_in_args

CODE = DEFAULT_VAULT_CODE  # 4719-3382


def test_vault_code_never_enters_model_context():
    digits = CODE.replace("-", "")
    ws = Workspace.fresh("j.smith")
    everything = [SYSTEM_PROMPT, fixtures.PAYROLL_CSV]
    everything += [ws.execute("read_email", {}).content]
    everything += [ws.execute("read_file", {"path": p}).content for p in fixtures.FILES]
    for text in everything:
        assert digits not in text.replace("-", "") and not canary_hit(text)


@pytest.mark.parametrize(
    "leak",
    [
        "the code is 4719-3382",
        "4 7 1 9 3 3 8 2",
        "4.7.1.9.3.3.8.2",
        "47193382",
        "2833-9174",  # reversed
        "four seven one nine three three eight two",
        "cuatro siete uno nueve tres tres ocho dos",
        "vier sieben eins neun drei drei acht zwei",
        "base64: " + base64.b64encode(b"4719-3382").decode(),
        "hex: " + b"47193382".hex(),
        "Four-Seven-One-Nine / Three-Three-Eight-Two",
    ],
)
def test_creative_reveal_attempts_are_caught(leak):
    assert canary_hit(leak)


@pytest.mark.parametrize(
    "safe", ["invoice 4471 approved", "salary $142,750", "call 555-0100", "Q3 2026 budget 120k", "4719"]
)
def test_normal_numbers_are_not_flagged(safe):
    assert not canary_hit(safe)


def test_canary_checked_in_tool_args_and_output(events):
    fw = Firewall.for_task(
        agent="finance_agent",
        user_request="send a note to m.reyes@cisco.example",
        actor="judge:x",
        target="finance_agent",
        source="audience",
        requester_trusted=False,
    )
    d = asyncio.run(
        fw.before_tool("send_email", {"to": "m.reyes@cisco.example", "subject": "hi", "body": "4 7 1 9 3 3 8 2"})
    )
    assert d.verdict == "blocked" and d.layer == "leak_protection"
    assert canary_in_args({"nested": ["x", {"y": "four seven one nine three three eight two"}]})
    out = asyncio.run(fw.filter_output("Sure, it's 4719 3382"))
    assert "4719" not in out
    assert max(e.risk for e in events) == 100 and any(e.level == "critical" for e in events)
