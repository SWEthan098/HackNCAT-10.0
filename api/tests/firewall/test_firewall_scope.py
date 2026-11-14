import asyncio

from firewall.core import Firewall
from firewall.policy import get_policy
from firewall.scope import derive_scope
from schemas.mitre import MITRE

FA = get_policy("finance_agent")


def test_read_only_requests_get_read_only_scope():
    for req in ["Summarize my inbox", "What does the budget file say?", "Any emails from Maria?"]:
        scope = derive_scope(FA, req)
        assert scope.read_only and not scope.allows("send_email"), req
        assert scope.allows("read_email") and scope.allows("read_file")


def test_send_requests_grant_send_and_trust_typed_recipients():
    scope = derive_scope(FA, "Send the budget to m.reyes@cisco.example")
    assert scope.allows("send_email") and not scope.read_only
    assert scope.trusted_recipients == {"m.reyes@cisco.example"}


def test_read_only_task_cannot_send(run, events):
    # The poisoned email tells the (gullible) agent to send payroll outside. Task is read-only.
    out = run("Summarize my inbox")
    sends = [d for d in out.firewall.ctx.decisions if d.tool == "send_email"]
    assert sends and all(d.verdict == "blocked" and d.layer == "scope_policy" for d in sends)
    assert "only allowed reading" in sends[0].reason
    assert out.run.sent == []
    assert "You have 9 emails" in out.run.output


def test_every_decision_is_recorded_with_mitre_from_the_table(run, events):
    out = run("Summarize my inbox")
    decisions = out.firewall.ctx.decisions
    assert len(events) == len(decisions) >= 3
    known = {m.technique_id for m in MITRE.values()}
    for ev in events:
        assert ev.sensor == "agent_firewall"
        assert ev.actor == "j.smith" and ev.target == "finance_agent" and ev.source == "scripted"
        assert ev.reason
        assert all(m.technique_id in known for m in ev.mitre)
    blocked = [e for e in events if e.verdict == "blocked"]
    assert blocked and {m.technique_id for m in blocked[0].mitre} >= {"AML.T0051.001", "AML.T0053"}


def test_tool_outside_policy_and_bad_paths_are_blocked(run):
    out = run("Read /vault/code.txt")
    assert out.run.executed == []  # planner only knows allowlisted files; nothing ran
    fw = Firewall.for_task(
        agent="finance_agent", user_request="read stuff", actor="a", target="finance_agent", source="scripted"
    )
    d = asyncio.run(fw.before_tool("delete_all", {}))
    assert d.verdict == "blocked" and "never allowed" in d.reason
    d = asyncio.run(fw.before_tool("read_file", {"path": "/shared/finance/../../vault/code.txt"}))
    assert d.verdict == "blocked"


def test_unknown_agent_fails_closed():
    fw = Firewall.for_task(agent="ghost", user_request="read", actor="a", target="ghost", source="scripted")
    assert asyncio.run(fw.before_tool("read_email", {})).verdict == "blocked"
