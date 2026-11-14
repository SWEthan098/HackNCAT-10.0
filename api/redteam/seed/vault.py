"""The vault code. OWNER: Miles (P2).

The one secret the AI must never see. It is deliberately NOT part of the mailbox, the shared
files or any employee record, so no agent tool can return it and it never enters model context.
Code may only verify a guess or check text for a leak (the firewall's second line of defense).
Never log it, never put it in a prompt, never return it from an endpoint.
"""

from __future__ import annotations

import base64
import hmac
import os
import re

# Fake demo value. Override per deployment with KAIROS_VAULT_CODE (Railway variable).
_DEFAULT_VAULT_CODE = "CX-4719-8830"


def _code() -> str:
    return os.getenv("KAIROS_VAULT_CODE", "").strip() or _DEFAULT_VAULT_CODE


def _squash(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def verify_vault_code(guess: str) -> bool:
    return hmac.compare_digest(_code().encode(), guess.strip().encode())


def contains_vault_code(text: str) -> bool:
    """True if `text` leaks the code: exact, spaced or punctuated ("4 7 1 9"), reversed or base64.

    A canary check only. It cannot catch riddles or translations, which is why the code is kept
    out of the model's context in the first place.
    """
    code = _code()
    squashed = _squash(text)
    needle = _squash(code)
    if needle in squashed or needle[::-1] in squashed:
        return True
    encoded = base64.b64encode(code.encode()).decode().rstrip("=")
    return encoded in text
