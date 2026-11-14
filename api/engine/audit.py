"""Tamper-evident audit log. OWNER: Daylen (P3).

Rows are appended by the SQL function audit_append() (supabase/migrations/..._audit_chain.sql),
which hashes each row together with the previous one under a lock. Nothing else writes audit_log.

`detail` is stored forever and shown to signed-in users: pass facts only (ids, names, scores).
Never pass attacker text, message bodies or raw login data.
"""

from __future__ import annotations

from typing import Any

from schemas.kairos import AuditVerifyResponse


def _one(data):
    if isinstance(data, list):
        return data[0] if data else None
    return data


def write_audit(db, *, actor: str, action: str, detail: dict[str, Any] | None = None) -> dict:
    """Append one audit entry and return the stored row (id, hash, prev_hash, ...)."""
    row = _one(db.rpc("audit_append", {"p_actor": actor, "p_action": action, "p_detail": detail or {}}).execute().data)
    if not row:
        raise RuntimeError("audit_append returned no row")
    return row


def verify_audit(db) -> AuditVerifyResponse:
    """Re-walk the whole chain in the database. ok=False names the first row that does not match."""
    row = _one(db.rpc("audit_verify", {}).execute().data)
    if not row:
        raise RuntimeError("audit_verify returned no row")
    bad = row.get("first_bad_id")
    return AuditVerifyResponse(
        ok=bool(row["ok"]),
        entries_checked=int(row["entries_checked"]),
        first_bad_entry=None if bad is None else str(bad),
    )
