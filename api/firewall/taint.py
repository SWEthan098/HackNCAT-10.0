"""Taint tracking. OWNER: Ethan (P1).

Everything the agent reads (emails, files) is labeled untrusted. Untrusted content can never drive
a sensitive action: a send_email recipient must come from the human's own request, and data with a
sensitive label (payroll) may only be sent when the human asked for it. These checks are plain
string logic: they hold even when every AI detector is fooled.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from agents.victim.fixtures import FILE_ALIASES

ADDRESS = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


@dataclass(frozen=True)
class Segment:
    origin: str
    text: str
    labels: frozenset[str] = field(default_factory=frozenset)


class TaintTracker:
    def __init__(self) -> None:
        self.segments: list[Segment] = []

    def add(self, origin: str, text: str, labels: frozenset[str] = frozenset()) -> None:
        self.segments.append(Segment(origin, text, labels))

    def origin_of(self, value: str) -> str | None:
        """Where an untrusted value came from, or None if it never appeared in untrusted content."""
        needle = value.strip().lower()
        if not needle:
            return None
        for seg in self.segments:
            if needle in seg.text.lower():
                return seg.origin
        return None

    def sensitive_labels_in(self, text: str) -> set[str]:
        """Labels of sensitive segments whose data shows up in `text` (any row with 2+ of its values)."""
        found: set[str] = set()
        low = text.lower()
        for seg in self.segments:
            if not seg.labels:
                continue
            for line in seg.text.splitlines()[1:]:
                values = [v.strip().lower() for v in re.split(r",(?=\S)", line) if len(v.strip()) >= 5]
                if sum(1 for v in values if v in low) >= 2:
                    found |= set(seg.labels)
                    break
        return found


def recipients(to: str) -> list[str]:
    """All addresses in a To field ("a@x, b@y"); a To with no valid address yields the raw value."""
    found = [a.lower().rstrip(".,;:") for a in ADDRESS.findall(to)]
    return found or ([to.strip().lower()] if to.strip() else [""])


def labels_requested(user_request: str) -> set[str]:
    """Sensitive labels the human explicitly asked about ("send the payroll to ...")."""
    low = user_request.lower()
    labels = set()
    for alias, path in FILE_ALIASES.items():
        if alias in low and "payroll" in path:
            labels.add("payroll")
    if "/shared/finance/payroll" in low:
        labels.add("payroll")
    return labels
