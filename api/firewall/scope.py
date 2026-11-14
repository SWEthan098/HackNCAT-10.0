"""Scoped permissions per request. OWNER: Ethan (P1).

"Summarize my inbox" grants a read-only scope for that task, so the agent cannot send anything no
matter what it is tricked into. A sensitive tool is granted only when the human's own words ask
for that action. Email addresses the human typed are the only trusted recipients.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from firewall.policy import AgentPolicy

# What the human must say for each sensitive tool to be granted for this task.
_INTENT: dict[str, re.Pattern[str]] = {
    "send_email": re.compile(
        r"\b(send|forward|reply|respond|e-?mail\s+(?:it|this|that|them|him|her|the|a|an|my|our|[\w.+-]+@)"
        r"|mail\s+(?:it|this|that|them)|share\s+(?:it|this|that|them)?\s*with)\b",
        re.I,
    ),
    "propose_response": re.compile(
        r"\b(recommend|propose|suggest|contain|containment|respond|response|what should (?:i|we) do|next steps?)\b",
        re.I,
    ),
}

ADDRESS = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")


@dataclass(frozen=True)
class Scope:
    granted: frozenset[str]
    read_only: bool
    trusted_recipients: frozenset[str] = field(default_factory=frozenset)

    def allows(self, tool: str) -> bool:
        return tool in self.granted

    def describe(self) -> str:
        return "read-only" if self.read_only else "read + " + ", ".join(sorted(self.granted))


def derive_scope(policy: AgentPolicy, user_request: str) -> Scope:
    granted = {t for t in policy.tools if not policy.is_sensitive(t)}
    for tool in policy.sensitive_tools:
        pattern = _INTENT.get(tool)
        if pattern is not None and pattern.search(user_request):
            granted.add(tool)
    sensitive_granted = granted & set(policy.sensitive_tools)
    recipients = frozenset(a.lower().rstrip(".,;:") for a in ADDRESS.findall(user_request))
    return Scope(frozenset(granted), read_only=not sensitive_granted, trusted_recipients=recipients)
