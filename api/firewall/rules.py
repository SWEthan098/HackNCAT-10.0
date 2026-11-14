"""Code-based injection backstop for the injection_scan layer. OWNER: Ethan (P1).

Miles's `scan_injection` (an LLM + rules) is the main scanner. This is a small deterministic
backstop so the AI scanner never decides alone: obvious instruction overrides, jailbreak role-play,
and disguises (invisible characters, base64, look-alike letters). It is code, so it keeps working
when the AI detectors are off or offline.
"""

from __future__ import annotations

import base64
import binascii
import re
import unicodedata

from schemas.kairos import Detection

_ZERO_WIDTH = re.compile("[​‌‍⁠﻿­᠎‪-‮⁦-⁩]")

_OVERRIDE = re.compile(
    r"\b(ignore|disregard|forget|override|bypass|skip)\b[^.\n]{0,40}\b(rules?|instructions?|guidelines?|polic(?:y|ies)"
    r"|prompt|guardrails?|restrictions?|safety)\b"
    r"|\b(new|updated|real)\s+(system\s+)?instructions?\b"
    r"|\bsystem\s+(prompt|override|note|message)\b"
    r"|\bnote\s+to\s+(the\s+)?(ai|assistant|model|llm)\b"
    r"|\b(do\s+not|don't)\s+(tell|mention|inform|alert)\b[^.\n]{0,30}\b(user|anyone|human|security)\b"
    r"|\b(reveal|print|show|leak|tell\s+me)\b[^.\n]{0,30}\b(vault|secret|code|password|system\s+prompt)\b"
    r"|\bthis\s+(message|request|email)\s+is\s+(safe|authorized|approved|pre-?approved)\b"
    r"|\bnote\s+to\s+(the\s+)?security\s+system\b",
    re.I,
)
_JAILBREAK = re.compile(
    r"\b(you\s+are\s+now|pretend\s+(to\s+be|you\s+are)|act\s+as|role-?play|developer\s+mode|jailbreak"
    r"|\bDAN\b|do\s+anything\s+now|no\s+(rules|restrictions|limits)|unfiltered|evil\s+(ai|assistant))",
    re.I,
)
_B64 = re.compile(r"[A-Za-z0-9+/]{12,}={0,2}")


def normalize(text: str) -> tuple[str, list[str]]:
    """NFKC + strip invisible characters + decode base64 snippets. Returns (text, disguises found)."""
    disguises: list[str] = []
    if _ZERO_WIDTH.search(text):
        disguises.append("invisible characters")
        text = _ZERO_WIDTH.sub("", text)
    folded = unicodedata.normalize("NFKC", text)
    if _mixed_scripts(folded):
        disguises.append("look-alike letters")
        folded = _fold_confusables(folded)
    decoded = []
    for token in _B64.findall(folded):
        try:
            plain = base64.b64decode(token + "=" * (-len(token) % 4), validate=True).decode("utf-8")
        except (binascii.Error, ValueError, UnicodeDecodeError):
            continue
        if sum(c.isprintable() for c in plain) >= 0.9 * len(plain) and re.search(r"[a-z]{3}", plain, re.I):
            decoded.append(plain)
    if decoded:
        disguises.append("base64")
        folded = folded + "\n" + "\n".join(decoded)
    return folded, disguises


_CONFUSABLE = str.maketrans(
    {
        "а": "a",
        "е": "e",
        "о": "o",
        "р": "p",
        "с": "c",
        "у": "y",
        "х": "x",
        "і": "i",
        "ѕ": "s",
        "ԁ": "d",
        "Α": "A",
        "Β": "B",
        "Ε": "E",
        "Ι": "I",
        "Κ": "K",
        "Μ": "M",
        "Ν": "N",
        "Ο": "O",
        "Ρ": "P",
        "Τ": "T",
        "ο": "o",
        "ι": "i",
        "α": "a",
    }  # fmt: skip
)


def _mixed_scripts(text: str) -> bool:
    for word in re.findall(r"\w{3,}", text):
        scripts = {unicodedata.name(c, "").split(" ")[0] for c in word if c.isalpha()}
        if "LATIN" in scripts and scripts & {"CYRILLIC", "GREEK"}:
            return True
    return False


def _fold_confusables(text: str) -> str:
    return text.translate(_CONFUSABLE)


def keyword_scan(text: str) -> Detection:
    plain, disguises = normalize(text)
    override = _OVERRIDE.search(plain)
    jailbreak = _JAILBREAK.search(plain)
    if not (override or jailbreak or disguises):
        return Detection(flagged=False, confidence=0.0, technique=None, explanation="No known injection patterns.")
    parts = []
    if disguises:
        parts.append("obfuscated (" + ", ".join(disguises) + ")")
    if jailbreak:
        parts.append("jailbreak role-play")
    if override:
        parts.append("instruction override")
    technique = " + ".join(parts)
    confidence = 0.95 if override or jailbreak else 0.6
    what = f'"{(override or jailbreak).group(0)[:60]}"' if (override or jailbreak) else "disguised text"
    return Detection(
        flagged=True,
        confidence=confidence,
        technique=technique,
        explanation=f"Kairos rules matched {what} ({technique}).",
    )
