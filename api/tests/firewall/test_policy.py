import pytest

from firewall.policy import PolicyError, get_policy, load_policies, parse_policies


def test_policies_yaml_loads():
    policies = load_policies()
    fa = policies["finance_agent"]
    assert fa.tools == ["read_email", "read_file", "send_email"]
    assert fa.send_email.allowed_domains == ["cisco.example"]
    assert fa.requires_approval_at_level == "high"
    assert fa.is_sensitive("send_email") and not fa.is_sensitive("read_email")
    assert "security_analyst" in policies


@pytest.mark.parametrize(
    "addr,ok",
    [
        ("cfo@cisco.example", True),
        ("J.Smith@Cisco.Example", True),
        ("ops@mail.cisco.example", True),
        ("x@evil.example", False),
        ("x@cisco.example.evil.example", False),
        ("x@notcisco.example", False),
        ("cisco.example", False),
        ("a@b@cisco.example", False),
        ("@cisco.example", False),
    ],
)
def test_domain_allowlist(addr, ok):
    assert get_policy("finance_agent").domain_allowed(addr) is ok


@pytest.mark.parametrize(
    "path,ok",
    [
        ("/shared/finance/payroll.csv", True),
        ("shared/finance/q3.txt", True),
        ("/shared/finance/../../vault/code.txt", False),
        ("/vault/code.txt", False),
        ("/shared/financeX/a.txt", False),
    ],
)
def test_path_allowlist(path, ok):
    assert get_policy("finance_agent").path_allowed(path) is ok


def test_unknown_agent_fails_closed():
    with pytest.raises(PolicyError):
        get_policy("nope_agent")


@pytest.mark.parametrize(
    "text",
    [
        "finance_agent: [",  # bad yaml
        "[]",  # not a mapping
        "a:\n  tools: [send_email]\n",  # send_email without a domain rule
        "a:\n  tools: [read_email]\n  sensitive_tools: [send_email]\n",  # sensitive tool not allowed
        "a:\n  tools: [read_email]\n  surprise: true\n",  # unknown key
    ],
)
def test_bad_policy_files_are_rejected(text):
    with pytest.raises(PolicyError):
        parse_policies(text)
