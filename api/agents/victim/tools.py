"""The victim agent's tools. OWNER: Ethan (P1).

send_email NEVER sends real email: it appends to a fake outbox. A `Workspace` is built fresh for
every task, so nothing an attacker plants survives into the next task (no memory between tasks).
"""

from __future__ import annotations

import threading
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from agents.victim.fixtures import FILES, Email, FileDoc, mailbox_for

TOOL_NAMES = ("read_email", "read_file", "send_email")


@dataclass(frozen=True)
class SentEmail:
    at: str
    sender: str
    to: str
    subject: str
    body: str
    mode: str  # protected | unprotected
    actor: str


class FakeOutbox:
    """Process-wide fake outbox (newest last). TODO: persist to an `outbox` table once Daylen adds it."""

    def __init__(self, maxlen: int = 200):
        self._items: deque[SentEmail] = deque(maxlen=maxlen)
        self._lock = threading.Lock()

    def add(self, item: SentEmail) -> None:
        with self._lock:
            self._items.append(item)

    def items(self) -> list[SentEmail]:
        with self._lock:
            return list(self._items)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


OUTBOX = FakeOutbox()


@dataclass(frozen=True)
class ToolResult:
    content: str
    origin: str  # where the text came from, e.g. "email:e-009" or "file:/shared/finance/x"
    untrusted: bool = True  # anything not typed by the human is untrusted
    labels: frozenset[str] = field(default_factory=frozenset)
    ok: bool = True


@dataclass
class Workspace:
    owner: str  # mailbox owner, e.g. "j.smith" or "guest07"
    mode: str = "protected"
    actor: str = ""
    emails: list[Email] = field(default_factory=list)
    files: dict[str, FileDoc] = field(default_factory=dict)
    outbox: FakeOutbox = OUTBOX
    sent: list[SentEmail] = field(default_factory=list)

    @classmethod
    def fresh(cls, owner: str, *, mode: str = "protected", actor: str = "", extra_emails: list[Email] | None = None):
        return cls(
            owner=owner,
            mode=mode,
            actor=actor or owner,
            emails=mailbox_for(owner) + list(extra_emails or []),
            files=dict(FILES),
        )

    @property
    def address(self) -> str:
        return self.owner if "@" in self.owner else f"{self.owner}@cisco.example"

    def execute(self, tool: str, args: dict[str, Any]) -> ToolResult:
        if tool == "read_email":
            return self._read_email(args.get("email_id"))
        if tool == "read_file":
            return self._read_file(str(args.get("path", "")))
        if tool == "send_email":
            return self._send_email(str(args.get("to", "")), str(args.get("subject", "")), str(args.get("body", "")))
        return ToolResult(f"unknown tool '{tool}'", origin="agent", untrusted=False, ok=False)

    def _read_email(self, email_id: str | None) -> ToolResult:
        if email_id:
            email = next((e for e in self.emails if e.id == email_id), None)
            if email is None:
                return ToolResult(f"no email with id {email_id}", origin="mailbox", untrusted=False, ok=False)
            return ToolResult(_format_email(email), origin=f"email:{email.id}")
        return ToolResult("\n\n".join(_format_email(e) for e in self.emails), origin="mailbox")

    def _read_file(self, path: str) -> ToolResult:
        doc = self.files.get(path) or self.files.get("/" + path.lstrip("/"))
        if doc is None:
            return ToolResult(f"file not found: {path}", origin="files", untrusted=False, ok=False)
        return ToolResult(doc.content, origin=f"file:{doc.path}", labels=doc.labels)

    def _send_email(self, to: str, subject: str, body: str) -> ToolResult:
        item = SentEmail(datetime.now(UTC).isoformat(), self.address, to, subject, body, self.mode, self.actor)
        self.sent.append(item)
        self.outbox.add(item)
        return ToolResult(f"(fake outbox) message to {to} queued", origin="outbox", untrusted=False)


def _format_email(e: Email) -> str:
    return f"[{e.id}] From: {e.sender}\nSubject: {e.subject}\n{e.body}"
