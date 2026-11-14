"""Demo reset. OWNER: Daylen (P3). red_team only (checked by the router)."""

from __future__ import annotations

from engine import hooks
from engine.audit import write_audit

_ANY_UUID = "00000000-0000-0000-0000-000000000000"
# Children before parents. user_roles and audit_log are never touched.
_TABLES = ("approvals", "appeals", "events", "incidents", "attempts", "public_feed")


def reset_demo(db, *, by: str) -> dict[str, int]:
    """Back to a clean stage: no incidents, events, approvals, appeals or audience data, nothing
    locked or frozen (kill switch off). Miles's seed (redteam.seed.seed_database) is then reloaded,
    so every sandbox account and agent is back in entity_state, unlocked and unfrozen.

    The audit log is kept on purpose (it is the record that a reset happened) and gets one entry.
    """
    counts: dict[str, int] = {}
    for table in _TABLES:
        counts[table] = len(db.table(table).delete().neq("id", _ANY_UUID).execute().data or [])
    counts["entity_state"] = len(db.table("entity_state").delete().neq("entity", "").execute().data or [])
    hooks.demo_reset(db)  # Comms Guard clears held messages; the seed restores the clean baseline
    write_audit(db, actor=by, action="demo_reset", detail={"deleted": counts})
    return counts
