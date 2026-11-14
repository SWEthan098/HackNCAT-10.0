"""Data loss prevention + link/image stripping. OWNER: Ethan (P1).

Profiles:
- internal: SSNs, API keys/secrets, card numbers (always protected)
- public:   internal + salaries, bank/account numbers, personal data (phones, birth dates).
            Used for /attack, where the person reading the reply is an outsider.

Links and images: markdown images and HTML <img> are always removed (nothing auto-loads); links
to any domain not on the allowlist are replaced so nothing can smuggle data out in a URL.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlsplit

PUBLIC = "public"
INTERNAL = "internal"


def _luhn(number: str) -> bool:
    digits = [int(d) for d in number if d.isdigit()]
    if not 13 <= len(digits) <= 19:
        return False
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


_ALWAYS: list[tuple[str, re.Pattern[str]]] = [
    ("private_key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)")),
    (
        "api_key",
        re.compile(
            r"\b(?:sk-ant-[\w-]{16,}|sk-[A-Za-z0-9_-]{16,}|gsk_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}"
            r"|gh[pousr]_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}"
            r"|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})"
        ),
    ),
    ("secret", re.compile(r"(?i)\b(?:api[_ -]?key|secret|token|password|passwd)\s*[:=]\s*\S{6,}")),
    ("ssn", re.compile(r"\b\d{3}[- ]\d{2}[- ]\d{4}\b")),
    ("card_number", re.compile(r"\b(?:\d[ -]?){12,18}\d\b")),
]

_PUBLIC_ONLY: list[tuple[str, re.Pattern[str]]] = [
    ("salary", re.compile(r"\$\s?\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\$\s?\d{4,}(?:\.\d{2})?|\b\d{2,3}(?:\.\d)?k\b", re.I)),
    ("account_number", re.compile(r"\b\d{8,17}\b")),
    ("phone", re.compile(r"(?<!\d)(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}(?!\d)")),
    ("birth_date", re.compile(r"(?i)\b(?:dob|born|birth(?:day|date)?)\b[^\n]{0,20}?\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}")),
]

REDACTED = "[redacted:{kind}]"


@dataclass(frozen=True)
class DlpResult:
    text: str
    kinds: tuple[str, ...]

    @property
    def found(self) -> bool:
        return bool(self.kinds)


def _patterns(profile: str) -> list[tuple[str, re.Pattern[str]]]:
    return _ALWAYS + (_PUBLIC_ONLY if profile == PUBLIC else [])


def redact(text: str, profile: str = INTERNAL) -> DlpResult:
    kinds: list[str] = []
    for kind, pattern in _patterns(profile):

        def sub(m: re.Match[str], kind: str = kind) -> str:
            if kind == "card_number" and not _luhn(m.group(0)):
                return m.group(0)
            kinds.append(kind)
            return REDACTED.format(kind=kind)

        text = pattern.sub(sub, text)
    return DlpResult(text, tuple(dict.fromkeys(kinds)))


def scan(text: str, profile: str = INTERNAL) -> tuple[str, ...]:
    return redact(text, profile).kinds


# ------------------------------------------------------------------------------ links
_MD_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_HTML_IMG = re.compile(r"<\s*img\b[^>]*>", re.I)
_MD_LINK = re.compile(r"\[([^\]]*)\]\(([^)\s]+)[^)]*\)")
_URL = re.compile(r"\b(?:https?://|www\.)[^\s<>()\"']+|\bdata:[\w/+.-]+;base64,[A-Za-z0-9+/=]+", re.I)


def _host(url: str) -> str:
    if url.lower().startswith("data:"):
        return ""
    if not re.match(r"(?i)^https?://", url):
        url = "http://" + url
    try:
        return (urlsplit(url).hostname or "").lower()
    except ValueError:
        return ""


def domain_allowed(url: str, allowed_domains: list[str]) -> bool:
    host = _host(url)
    return bool(host) and any(host == d or host.endswith("." + d) for d in allowed_domains)


def strip_links(text: str, allowed_domains: list[str]) -> tuple[str, int]:
    """Remove images and links to non-allowlisted domains. Returns (clean text, items removed)."""
    removed = 0

    def drop(_m: re.Match[str]) -> str:
        nonlocal removed
        removed += 1
        return "[image removed]"

    text = _MD_IMAGE.sub(drop, text)
    text = _HTML_IMG.sub(drop, text)

    def md_link(m: re.Match[str]) -> str:
        nonlocal removed
        if domain_allowed(m.group(2), allowed_domains):
            return m.group(0)
        removed += 1
        return f"{m.group(1)} [link removed]"

    text = _MD_LINK.sub(md_link, text)

    def bare(m: re.Match[str]) -> str:
        nonlocal removed
        url = m.group(0).rstrip(".,;:!?")
        if domain_allowed(url, allowed_domains):
            return m.group(0)
        removed += 1
        return "[link removed]" + m.group(0)[len(url) :]

    text = _URL.sub(bare, text)
    return text, removed


def has_foreign_links(text: str, allowed_domains: list[str]) -> bool:
    return strip_links(text, allowed_domains)[1] > 0
