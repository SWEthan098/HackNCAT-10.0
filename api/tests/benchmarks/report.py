"""Collects benchmark results so conftest can print them. OWNER: Miles (P2)."""

# ruff: noqa: E501  (one attack / one report line per source line)
from __future__ import annotations

RESULTS: dict[str, dict] = {}


def pct(part: int, whole: int) -> str:
    return f"{100 * part / whole:.1f}%" if whole else "n/a"


def lines() -> list[str]:
    out: list[str] = []
    scan = RESULTS.get("scanner")
    if scan:
        total, caught = scan["attacks"], scan["caught"]
        out.append("Injection scanner (offline: normalization + keyword rules, no model)")
        for group, (hit, n) in scan["groups"].items():
            out.append(f"  {group:<12} caught {hit:>2}/{n:<2} ({pct(hit, n)})")
        out.append(f"  attacks reaching the agent unflagged WITHOUT Kairos: {total}/{total} (100.0%)")
        out.append(
            f"  attacks reaching the agent unflagged WITH Kairos:    {total - caught}/{total} ({pct(total - caught, total)})"
        )
        out.append(
            f"  false positives on normal traffic: {scan['false_positives']}/{scan['normal']} ({pct(scan['false_positives'], scan['normal'])})"
        )
        out.append(
            f"  disguised attacks labelled AML.T0068: {scan['obfuscation_labelled']}/{scan['groups']['obfuscated'][1]}"
        )
        out.append(f"  added latency per scan: mean {scan['mean_ms']:.2f} ms, p95 {scan['p95_ms']:.2f} ms")
        out.append("  (a miss here is not a breach: the firewall's hard rules still apply)")
    login = RESULTS.get("login")
    if login:
        out.append("Login Guard")
        out.append(f"  bot patterns flagged: {login['bots_flagged']}/{login['bots']}")
        out.append(
            f"  normal + assistive-tech logins flagged (false positives): {login['false_positives']}/{login['normal']}"
        )
    comms = RESULTS.get("comms")
    if comms:
        out.append("Comms Guard")
        out.append(f"  fake boss money requests flagged: {comms['flagged']}/{comms['attacks']}")
        out.append(f"  normal emails flagged (false positives): {comms['false_positives']}/{comms['normal']}")
    chain = RESULTS.get("chain")
    if chain:
        out.append("Scripted chain (password guessing -> fake CFO -> poisoned email)")
        out.append(f"  without Kairos: {chain['unprotected']}")
        out.append(
            f"  with Kairos:    {chain['protected']}, event risks {chain['risks']} -> incident {chain['incident']} ({chain['level']})"
        )
    return out
