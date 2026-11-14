"""KPI strip numbers. OWNER: Daylen (P3)."""

from __future__ import annotations

from engine.incidents import OPEN_STATUSES
from engine.util import parse_ts
from schemas.kairos import Stats


def _count(query) -> int:
    result = query.limit(1).execute()
    return int(result.count if result.count is not None else len(result.data))


def get_stats(db) -> Stats:
    """All counted from the database, never estimated.

    breaches: attempts the firewall marked `breach` (canary in any output or tool argument, an
    email leaving cisco.example, or payroll/personal data shown to an outsider). The firewall
    decides that flag in code; this only counts it.
    """
    blocked = _count(db.table("events").select("id", count="exact").eq("verdict", "blocked"))
    breaches = _count(db.table("attempts").select("id", count="exact").eq("breach", True))
    false_positives = _count(db.table("incidents").select("id", count="exact").eq("status", "false_positive"))

    decided = (
        (db.table("approvals").select("created_at,decided_at").in_("status", ["approved", "denied"]).limit(1000))
        .execute()
        .data
    )
    times = [
        (parse_ts(a["decided_at"]) - parse_ts(a["created_at"])).total_seconds() * 1000
        for a in decided
        if a.get("decided_at")
    ]

    open_incidents = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    rows = db.table("incidents").select("level").in_("status", list(OPEN_STATUSES)).limit(1000).execute().data
    for row in rows:
        open_incidents[row["level"]] = open_incidents.get(row["level"], 0) + 1

    return Stats(
        attacks_blocked=blocked,
        breaches=breaches,
        false_positives=false_positives,
        avg_decision_ms=round(sum(times) / len(times), 1) if times else 0.0,
        open_incidents=open_incidents,
    )
