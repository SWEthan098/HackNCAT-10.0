"""CLI for the seed: `python -m redteam.seed [--reset | --check]` from api/. OWNER: Miles (P2)."""

from __future__ import annotations

import argparse
import os
import sys

from dotenv import load_dotenv

if os.getenv("API_SKIP_DOTENV") != "1":
    load_dotenv()

from core.db import supabase_admin  # noqa: E402
from core.errors import AppError  # noqa: E402
from redteam.seed import DISCLAIMER, DOMAIN, seed_database, summary, validate  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m redteam.seed", description=f"Seed the {DOMAIN} sandbox.")
    parser.add_argument("--reset", action="store_true", help="put every entity back to unlocked / unfrozen")
    parser.add_argument("--check", action="store_true", help="validate and print a summary, no database")
    args = parser.parse_args(argv)

    validate()
    print(f"Sandbox: {DOMAIN}. {DISCLAIMER}")
    for name, count in summary().items():
        print(f"  {name:<16}{count}")
    if args.check:
        print("Check only: seed data is valid, database not touched.")
        return 0

    try:
        sent = seed_database(supabase_admin(), reset=args.reset)
    except AppError as exc:
        print(f"Could not reach the database: {exc.message}", file=sys.stderr)
        return 1
    mode = "reset to baseline" if args.reset else "missing rows added, existing state kept"
    print(f"entity_state: {sent} rows upserted ({mode}). Safe to run again.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
