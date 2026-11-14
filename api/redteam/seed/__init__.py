"""Seed data for the fictional company "Cisco" on cisco.example. OWNER: Miles (P2).

The company (people, inbox, files, login baseline, vault code) is defined in code, so it works
offline and in DEMO_MODE. The only database rows are one `entity_state` row per sandbox entity.

    python -m redteam.seed            # from api/: add missing rows, keep current state
    python -m redteam.seed --reset    # also put every entity back to unlocked / unfrozen
    python -m redteam.seed --check    # validate and print a summary, no database

Safe to re-run: rows are keyed by entity name, so nothing is ever duplicated.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from redteam.seed.company import (
    AGENT_ID,
    AGENT_INBOX,
    CFO_USERNAME,
    COMMON_PASSWORDS,
    DISCLAIMER,
    DOMAIN,
    EMPLOYEES,
    GUESTS,
    TAKEOVER_USERNAME,
    Employee,
    all_entities,
    check_password,
    get_account,
    is_guest,
)
from redteam.seed.files import BUDGET_PATH, FILES, PAYROLL_PATH, list_files, read_file
from redteam.seed.logins import FEATURE_KEYS, normal_login_history
from redteam.seed.mailbox import (
    EXFIL_ADDRESS,
    MAILBOX,
    POISONED_EMAIL_ID,
    Email,
    get_email,
    get_mailbox,
    poisoned_email,
)
from redteam.seed.vault import contains_vault_code, verify_vault_code

__all__ = [
    "AGENT_ID",
    "AGENT_INBOX",
    "BUDGET_PATH",
    "CFO_USERNAME",
    "COMMON_PASSWORDS",
    "DISCLAIMER",
    "DOMAIN",
    "EMPLOYEES",
    "EXFIL_ADDRESS",
    "FEATURE_KEYS",
    "FILES",
    "GUESTS",
    "MAILBOX",
    "PAYROLL_PATH",
    "POISONED_EMAIL_ID",
    "TAKEOVER_USERNAME",
    "Email",
    "Employee",
    "all_entities",
    "check_password",
    "contains_vault_code",
    "get_account",
    "get_email",
    "get_mailbox",
    "is_guest",
    "list_files",
    "normal_login_history",
    "poisoned_email",
    "read_file",
    "seed_database",
    "summary",
    "validate",
    "verify_vault_code",
]

ENTITY_TABLE = "entity_state"


def validate() -> None:
    """Raise ValueError if the seed breaks one of the sandbox rules."""
    problems: list[str] = []
    addresses = [e.email for e in (*EMPLOYEES, *GUESTS)] + [m.sender for m in MAILBOX] + [m.to for m in MAILBOX]
    for address in addresses:
        if not address.endswith(f"@{DOMAIN}"):
            problems.append(f"address outside {DOMAIN}: {address}")
    readable = [m.subject + "\n" + m.body for m in MAILBOX] + list(FILES.values())
    readable += [f"{e.username} {e.name} {e.title} {e.password}" for e in (*EMPLOYEES, *GUESTS)]
    for text in readable:
        if "cisco.com" in text.lower():
            problems.append("real cisco.com domain found in seed content")
        if contains_vault_code(text):
            problems.append("vault code found in content the AI can read")
    if len(all_entities()) != len(set(all_entities())):
        problems.append("duplicate entity names")
    if len({m.id for m in MAILBOX}) != len(MAILBOX):
        problems.append("duplicate email ids")
    if sum(m.poisoned for m in MAILBOX) != 1:
        problems.append("expected exactly one poisoned email")
    takeover = get_account(TAKEOVER_USERNAME)
    if takeover is None or not takeover.weak_password:
        problems.append(f"{TAKEOVER_USERNAME} must have a weak password")
    if problems:
        raise ValueError("seed validation failed: " + "; ".join(sorted(set(problems))))


def summary() -> dict[str, int]:
    return {
        "employees": len(EMPLOYEES),
        "guests": len(GUESTS),
        "emails": len(MAILBOX),
        "poisoned_emails": sum(m.poisoned for m in MAILBOX),
        "files": len(FILES),
        "login_history": len(normal_login_history()),
        "entities": len(all_entities()),
    }


def seed_database(db: Any, *, reset: bool = False) -> int:
    """Upsert one entity_state row per sandbox entity; returns how many rows were sent.

    reset=False only adds missing rows, so a contained account stays contained.
    reset=True puts everything back to the clean baseline (what Reset demo wants).
    """
    validate()
    now = datetime.now(UTC).isoformat()
    rows = [
        {
            "entity": entity,
            "locked": False,
            "frozen": False,
            "sessions_revoked_at": None,
            "updated_at": now,
            "updated_by": "seed",
        }
        for entity in all_entities()
    ]
    db.table(ENTITY_TABLE).upsert(rows, on_conflict="entity", ignore_duplicates=not reset).execute()
    return len(rows)
