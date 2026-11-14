"""Read-only access to events and incidents for the analyst. OWNER: Ethan (P1).

Only `select` queries. Under DEMO_MODE (or with `demo=True`) it serves the deterministic scripted
chain so the analyst works on stage even if the database is down.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from schemas.mitre import tag

logger = logging.getLogger("api.analyst")

_T = datetime(2026, 11, 14, 12, 0, tzinfo=UTC).isoformat()


def _ev(i, sensor, actor, target, action, risk, level, verdict, reason, keys):
    return {
        "id": f"evt-{i}",
        "created_at": _T,
        "sensor": sensor,
        "actor": actor,
        "target": target,
        "source": "scripted",
        "action": action,
        "risk": risk,
        "level": level,
        "verdict": verdict,
        "reason": reason,
        "mitre": [tag(k).model_dump() for k in keys],
        "incident_id": "inc-demo",
    }


DEMO_EVENTS: list[dict[str, Any]] = [
    _ev(
        1, "login_guard", "bot:203.0.113.7", "j.smith", "credential stuffing, then login success", 45, "medium",
        "flagged", "143 fast failed logins from one source, then a success", ["credential_stuffing", "valid_accounts"],
    ),
    _ev(
        2, "comms_guard", "j.smith", "finance-staff", "urgent wire request posing as the CFO", 50, "medium",
        "flagged", "urgency + authority + secrecy + payment change, from an already flagged account",
        ["internal_spearphishing", "impersonation", "financial_theft"],
    ),
    _ev(
        3, "agent_firewall", "j.smith", "finance_agent", "tool_call_blocked:send_email", 55, "medium", "blocked",
        "Email can only go to @cisco.example; 'audit@payroll-verify.example' is outside.",
        ["prompt_injection_indirect", "agent_tool_invocation", "llm_data_leakage"],
    ),
]  # fmt: skip
DEMO_INCIDENT: dict[str, Any] = {
    "id": "inc-demo",
    "created_at": _T,
    "title": "Account takeover chain: j.smith -> finance_agent",
    "risk": 85,
    "level": "critical",
    "status": "awaiting_approval",
    "source": "scripted",
}


class AnalystData:
    def __init__(self, db: Any | None, *, demo: bool = False):
        self.db = db
        self.demo = demo or db is None
        self.unavailable = False  # set when the database errored (the analyst says so)

    def _select(self, table: str, **eq: str) -> list[dict]:
        try:
            q = self.db.table(table).select("*")
            for col, val in eq.items():
                q = q.eq(col, val)
            if hasattr(q, "order"):
                q = q.order("created_at", desc=True)
            return list(q.limit(50).execute().data or [])
        except Exception as e:
            logger.warning("analyst: read %s failed (%s)", table, type(e).__name__)
            self.unavailable = True
            return []

    # ---- the analyst's read-only tools ----------------------------------------------
    def get_incident(self, incident_id: str) -> dict | None:
        if self.demo:
            return dict(DEMO_INCIDENT) if incident_id == DEMO_INCIDENT["id"] else None
        rows = self._select("incidents", id=incident_id)
        return rows[0] if rows else None

    def query_events(self, *, incident_id: str | None = None, limit: int = 30) -> list[dict]:
        if self.demo:
            rows = [e for e in DEMO_EVENTS if incident_id in (None, e["incident_id"])]
        else:
            rows = self._select("events", incident_id=incident_id) if incident_id else self._select("events")
        return rows[:limit]

    def get_entity_history(self, entity: str, limit: int = 30) -> list[dict]:
        if self.demo:
            rows = [e for e in DEMO_EVENTS if entity in (e["actor"], e["target"])]
        else:
            seen: dict[str, dict] = {}
            for col in ("actor", "target"):
                for row in self._select("events", **{col: entity}):
                    seen[str(row.get("id"))] = row
            rows = list(seen.values())
        return rows[:limit]

    def recent_incidents(self, limit: int = 10) -> list[dict]:
        if self.demo:
            return [dict(DEMO_INCIDENT)]
        return self._select("incidents")[:limit]
