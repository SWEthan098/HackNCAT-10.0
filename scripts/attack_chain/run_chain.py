"""Run the scripted Red Team chain in-process and print both sides. OWNER: Miles (P2).

    cd api && python ../scripts/attack_chain/run_chain.py [protected|unprotected] [stage]

No network and no database: it only ever touches the fictional cisco.example sandbox data in
api/redteam/seed. Prints the attacker's log, then what Kairos recorded and the incident math.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[2] / "api"
sys.path.insert(0, str(API_DIR))
os.environ.setdefault("API_SKIP_DOTENV", "1")
os.environ.setdefault("AI_PROVIDER", "mock")

import engine  # noqa: E402
from redteam import chain  # noqa: E402


def main(argv: list[str]) -> int:
    mode = argv[1] if len(argv) > 1 else "protected"
    stage = argv[2] if len(argv) > 2 else "full_chain"
    if mode not in ("protected", "unprotected"):
        print("mode must be protected or unprotected", file=sys.stderr)
        return 2
    result = asyncio.run(chain.run(stage, mode))

    print("ATTACKER VIEW")
    for line in result.log_lines:
        print("  " + line)
    print(f"  outcome: {result.outcome}\n")

    print("KAIROS RECORDED")
    if not result.events:
        print("  nothing (Kairos is not in the path in unprotected mode)")
        return 0
    for e in result.events:
        ids = ", ".join(m.technique_id for m in e.mitre) or "-"
        print(f"  {e.sensor:<15} {e.actor} -> {e.target:<14} risk {e.risk:>3} {e.level:<8} {e.verdict:<8} [{ids}]")
    risks = [e.risk for e in result.events]
    sensors = {e.sensor for e in result.events}
    total = engine.incident_risk(risks, len(sensors))
    bonus = engine.EXTRA_SENSOR_BONUS * (len(sensors) - 1)
    print(f"\n  incident risk if linked: {max(risks)} + {bonus} = {total} ({engine.score_to_level(total)})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
