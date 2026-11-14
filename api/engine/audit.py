"""Tamper-evident audit log. OWNER: Daylen (P3).

Rows are appended by the SQL function audit_append() (supabase/migrations/..._audit_chain.sql),
which hashes each row together with the previous one under a lock. Nothing else writes audit_log.

`detail` is stored forever and shown to signed-in users: pass facts only (ids, names, scores).
Never pass attacker text, message bodies or raw login data.
"""

from __future__ import annotations

from typing import Any


def write_audit(db, *, actor: str, action: str, detail: dict[str, Any] | None = None) -> dict:
    """Append one audit entry and return the stored row (id, hash, prev_hash, ...)."""
    data = db.rpc("audit_append", {"p_actor": actor, "p_action": action, "p_detail": detail or {}}).execute().data
    if isinstance(data, list):
        data = data[0] if data else None
    if not data:
        raise RuntimeError("audit_append returned no row")
    return data
