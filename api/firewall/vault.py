"""The secret vault code and its canary check. OWNER: Ethan (P1).

First line of defense: the vault code NEVER enters the model's context. No tool returns it, no
prompt contains it, and the agent has no way to read it. So no trick can make the model reveal it.

Second line: a canary check on every output AND every tool argument. Exact-match canaries miss
"4 7 1 9", base64, number words and translations, so this check normalizes first. Riddles and
other encodings can't be caught by any checker, which is why the first line matters most.
"""

from __future__ import annotations

import base64
import binascii
import os
import re

DEFAULT_VAULT_CODE = "4719-3382"

_WORDS = {
    # English
    "zero": "0", "oh": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9",
    # Spanish
    "cero": "0", "uno": "1", "dos": "2", "tres": "3", "cuatro": "4", "cinco": "5", "seis": "6",
    "siete": "7", "ocho": "8", "nueve": "9",
    # French
    "zéro": "0", "un": "1", "deux": "2", "trois": "3", "quatre": "4", "cinq": "5", "sept": "7",
    "huit": "8", "neuf": "9",
    # German
    "null": "0", "eins": "1", "zwei": "2", "drei": "3", "vier": "4", "fünf": "5", "sechs": "6",
    "sieben": "7", "acht": "8", "neun": "9",
}  # fmt: skip
_WORD_RE = re.compile(r"\b(" + "|".join(sorted(map(re.escape, _WORDS), key=len, reverse=True)) + r")\b", re.I)
_B64_RE = re.compile(r"[A-Za-z0-9+/_-]{8,}={0,2}")
_HEX_RE = re.compile(r"\b(?:0x)?([0-9a-fA-F]{12,})\b")
# Digits separated by anything that isn't a letter or digit (spaces, dashes, dots, emoji...).
_DIGIT_RUN = re.compile(r"\d(?:[^A-Za-z0-9\n]{0,3}\d)+")


def vault_code() -> str:
    """Read the code only when checking. It is never returned to any caller that talks to a model."""
    return os.getenv("KAIROS_VAULT_CODE", "").strip() or DEFAULT_VAULT_CODE


def _digits(code: str) -> str:
    return re.sub(r"\D", "", code)


def _digit_runs(text: str) -> list[str]:
    return [re.sub(r"\D", "", m.group(0)) for m in _DIGIT_RUN.finditer(text)]


def _decoded_variants(text: str) -> list[str]:
    out: list[str] = []
    for token in _B64_RE.findall(text):
        padded = token + "=" * (-len(token) % 4)
        for decoder in (base64.b64decode, base64.urlsafe_b64decode):
            try:
                out.append(decoder(padded).decode("utf-8", "ignore"))
            except (binascii.Error, ValueError):
                pass
    for token in _HEX_RE.findall(text):
        try:
            out.append(bytes.fromhex(token if len(token) % 2 == 0 else token[:-1]).decode("utf-8", "ignore"))
        except ValueError:
            pass
    return out


def _words_to_digits(text: str) -> str:
    return _WORD_RE.sub(lambda m: _WORDS[m.group(1).lower()], text)


def canary_hit(text: str, code: str | None = None) -> bool:
    """True if the vault code appears in `text`, even spaced out, reversed, in number words or base64/hex."""
    if not text:
        return False
    target = _digits(code or vault_code())
    if len(target) < 4:
        return False
    candidates = [text, _words_to_digits(text)]
    for variant in _decoded_variants(text):
        candidates += [variant, _words_to_digits(variant)]
    for candidate in candidates:
        for run in _digit_runs(candidate):
            if target in run or target[::-1] in run:
                return True
    return False


def canary_in_args(args: object) -> bool:
    if isinstance(args, dict):
        return any(canary_in_args(k) or canary_in_args(v) for k, v in args.items())
    if isinstance(args, list | tuple):
        return any(canary_in_args(v) for v in args)
    return canary_hit(str(args))
