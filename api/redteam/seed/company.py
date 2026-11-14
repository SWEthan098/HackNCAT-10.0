"""The fictional company: people, the AI agent and the audience sandbox accounts. OWNER: Miles (P2).

Everything here is made up and lives on the reserved domain `cisco.example` (never cisco.com).
Passwords are sandbox fiction used only by the simulated Login Guard attacks.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass

DOMAIN = "cisco.example"
DISCLAIMER = "Fictional demo environment. Not affiliated with or endorsed by Cisco."

AGENT_ID = "finance_agent"
AGENT_INBOX = f"finance@{DOMAIN}"

# The takeover target of the scripted chain, and the boss the attacker pretends to be.
TAKEOVER_USERNAME = "j.smith"
CFO_USERNAME = "m.vale"

GUEST_COUNT = 30

# The wordlist the simulated bot tries. Anything in here counts as a weak password.
COMMON_PASSWORDS: tuple[str, ...] = (
    "123456",
    "password",
    "qwerty123",
    "letmein",
    "welcome1",
    "Password1!",
    "iloveyou",
    "admin123",
    "Cisco123",
    "Winter2025!",
    "Spring2026!",
    "Summer2026!",
)


@dataclass(frozen=True)
class Employee:
    username: str
    name: str
    title: str
    department: str
    password: str

    @property
    def email(self) -> str:
        return f"{self.username}@{DOMAIN}"

    @property
    def weak_password(self) -> bool:
        return self.password in COMMON_PASSWORDS


def _strong_password(username: str) -> str:
    """Deterministic, never in the wordlist, so re-seeding gives the same company."""
    return "Kx!" + hashlib.sha256(f"kairos-seed:{username}".encode()).hexdigest()[:20]


def _employee(username: str, name: str, title: str, department: str, password: str | None = None) -> Employee:
    return Employee(username, name, title, department, password or _strong_password(username))


EMPLOYEES: tuple[Employee, ...] = (
    _employee("p.raman", "Priya Raman", "Chief Executive Officer", "Executive"),
    _employee(CFO_USERNAME, "Marcus Vale", "Chief Financial Officer", "Executive"),
    _employee("d.okafor", "Dana Okafor", "IT Lead", "IT"),
    _employee("e.cruz", "Elena Cruz", "Finance Manager", "Finance"),
    _employee(TAKEOVER_USERNAME, "Jamie Smith", "Finance Analyst", "Finance", password="Summer2026!"),
    _employee("t.becker", "Tom Becker", "HR Partner", "People"),
    _employee("a.noor", "Aisha Noor", "Account Executive", "Sales"),
)


def _guest(n: int) -> Employee:
    username = f"guest{n:02d}"
    # Every fifth guest has a weak password so audience password guessing has an honest outcome.
    password = COMMON_PASSWORDS[n % len(COMMON_PASSWORDS)] if n % 5 == 0 else None
    return _employee(username, f"Guest {n:02d}", "Sandbox account", "Audience sandbox", password)


GUESTS: tuple[Employee, ...] = tuple(_guest(n) for n in range(1, GUEST_COUNT + 1))

_ACCOUNTS: dict[str, Employee] = {a.username: a for a in (*EMPLOYEES, *GUESTS)}


def get_account(username: str) -> Employee | None:
    return _ACCOUNTS.get(username)


def is_guest(username: str) -> bool:
    """Audience attacks may only hit these accounts."""
    return username in _ACCOUNTS and username.startswith("guest")


def check_password(username: str, guess: str) -> bool:
    account = _ACCOUNTS.get(username)
    return account is not None and hmac.compare_digest(account.password.encode(), guess.encode())


def all_entities() -> list[str]:
    """Every name that can appear as an actor or target inside the sandbox."""
    return [*_ACCOUNTS, AGENT_ID]
