"""Undo common disguises before text is scanned. OWNER: Miles (P2).

Attackers hide instructions with invisible characters, base64 and look-alike letters so a scanner
reading the raw text sees nothing. `normalize()` returns a cleaned copy plus what it had to undo,
so the scanner can label disguised attacks as AML.T0068 (LLM Prompt Obfuscation).
"""

from __future__ import annotations

import base64
import binascii
import re
import unicodedata
from dataclasses import dataclass, field

# Zero-width and other invisible format characters (incl. bidi overrides and the BOM).
_INVISIBLE = re.compile("[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁯﻿]")
# Unicode "tag" characters: invisible ASCII look-alikes used to smuggle whole hidden prompts.
_TAG_CHARS = re.compile("[\U000e0000-\U000e007f]")
_BASE64 = re.compile(r"(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/_-]{16,}={0,2}(?![A-Za-z0-9+/=_-])")
_WORD = re.compile(r"[^\W\d_]+")

# Cyrillic / Greek letters that look like Latin ones.
_LOOKALIKES = {
    "а": "a", "в": "b", "с": "c", "ԁ": "d", "е": "e", "ё": "e", "һ": "h", "і": "i", "ї": "i",
    "ј": "j", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "ѕ": "s", "т": "t", "у": "y",
    "х": "x", "ѡ": "w", "ԝ": "w", "ɡ": "g", "ӏ": "l",
    "А": "A", "В": "B", "С": "C", "Е": "E", "Н": "H", "І": "I", "Ј": "J", "К": "K", "М": "M",
    "О": "O", "Р": "P", "Ѕ": "S", "Т": "T", "У": "Y", "Х": "X",
    "α": "a", "β": "b", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t",
    "υ": "u", "χ": "x", "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K",
    "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
}  # fmt: skip
_LOOKALIKE_TABLE = str.maketrans(_LOOKALIKES)

MAX_DECODED_SNIPPETS = 5


@dataclass(frozen=True)
class Normalized:
    original: str
    text: str  # cleaned copy: invisible characters gone, look-alike letters folded to Latin
    decoded: tuple[str, ...] = ()  # readable text recovered from base64 snippets
    invisible_chars: int = 0
    lookalike_words: int = 0
    signals: tuple[str, ...] = field(default=())  # plain-English list of disguises found

    @property
    def disguised(self) -> bool:
        return bool(self.signals)

    @property
    def scan_text(self) -> str:
        """Everything a scanner should read: the cleaned text plus anything decoded."""
        return "\n".join((self.text, *self.decoded))


def _script(ch: str) -> str:
    name = unicodedata.name(ch, "")
    for script in ("LATIN", "CYRILLIC", "GREEK"):
        if name.startswith(script):
            return script
    return "OTHER"


def _mixed_script_words(text: str) -> int:
    """Words that mix Latin with Cyrillic or Greek letters, e.g. 'ignоre' with a Cyrillic o."""
    count = 0
    for word in _WORD.findall(text):
        scripts = {_script(ch) for ch in word}
        if "LATIN" in scripts and scripts & {"CYRILLIC", "GREEK"}:
            count += 1
    return count


def _decode_base64(snippet: str) -> str | None:
    raw = snippet.rstrip("=").replace("-", "+").replace("_", "/")
    try:
        data = base64.b64decode(raw + "=" * (-len(raw) % 4), validate=True)
        text = data.decode("utf-8")
    except (binascii.Error, UnicodeDecodeError, ValueError):
        return None
    printable = sum(ch.isprintable() or ch in "\n\t" for ch in text)
    letters = sum(ch.isalpha() or ch == " " for ch in text)
    # Random IDs and hashes decode to junk; real hidden messages decode to readable words.
    if len(text) < 8 or printable < len(text) or letters < 0.7 * len(text) or " " not in text.strip():
        return None
    return text


def normalize(text: str) -> Normalized:
    signals: list[str] = []

    tags = _TAG_CHARS.findall(text)
    hidden_tag_text = "".join(chr(ord(ch) - 0xE0000) for ch in tags if 0xE0020 <= ord(ch) <= 0xE007E)
    cleaned = _TAG_CHARS.sub("", text)
    cleaned, invisible = _INVISIBLE.subn("", cleaned)
    invisible += len(tags)
    if invisible:
        signals.append(f"{invisible} invisible character{'s' if invisible != 1 else ''}")

    styled = sum(0xFF01 <= ord(ch) <= 0xFF5E or 0x1D400 <= ord(ch) <= 0x1D7FF for ch in cleaned)
    if styled >= 5:
        signals.append("full-width or styled letters")
    cleaned = unicodedata.normalize("NFKC", cleaned)  # full-width and styled letters -> plain
    lookalike_words = _mixed_script_words(cleaned)
    if lookalike_words:
        signals.append("look-alike letters from another alphabet")
        cleaned = cleaned.translate(_LOOKALIKE_TABLE)

    decoded: list[str] = []
    if hidden_tag_text.strip():
        decoded.append(hidden_tag_text)
    found_base64 = False
    for match in _BASE64.finditer(cleaned):
        if len(decoded) >= MAX_DECODED_SNIPPETS:
            break
        plain = _decode_base64(match.group())
        if plain:
            found_base64 = True
            decoded.append(normalize(plain).text if _BASE64.search(plain) is None else plain)
    if found_base64:
        signals.append("base64-encoded text")

    return Normalized(
        original=text,
        text=cleaned,
        decoded=tuple(decoded),
        invisible_chars=invisible,
        lookalike_words=lookalike_words,
        signals=tuple(signals),
    )
