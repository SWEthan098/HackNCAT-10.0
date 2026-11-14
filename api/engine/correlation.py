"""Correlation: connect related events into ONE incident. OWNER: Daylen (P3).

Two events link only if they are from the same `source` AND
  (a) they have the same actor, or
  (b) takeover chain: the earlier event's target is the later event's actor
      (the bot targets j.smith, then j.smith acts).
A shared target alone NEVER links, or every judge attacking the same agent would merge.
Audience events link by same actor only: each judge (`judge:<nickname>`) stays their own attacker.

An incident opens when linked events come from 2 or more different listeners.
Incident risk = highest event risk + 15 per extra listener, capped at 100.
"""

from __future__ import annotations

from datetime import timedelta

from engine import hooks
from engine.approvals import FINISHED, create_approval
from engine.audit import write_audit
from engine.scoring import incident_risk, score_to_level
from engine.util import iso, parse_ts, safe_name, unique
from schemas.kairos import Event
from schemas.mitre import TACTIC_ORDER

WINDOW_MINUTES = 30
MAX_WINDOW_EVENTS = 500


def links(earlier: dict, later: dict) -> bool:
    """The whole linking rule, in one place. `earlier` happened before `later`."""
    if earlier["source"] != later["source"]:
        return False
    if earlier["actor"] == later["actor"]:
        return True
    if later["source"] == "scripted" and earlier["target"] == later["actor"]:
        return True
    return False


def _component(rows: list[dict], start_id: str) -> list[dict]:
    """Every event connected to `start_id` through links (rows are oldest first)."""
    index = {r["id"]: i for i, r in enumerate(rows)}
    if start_id not in index:
        return []
    seen, todo = {start_id}, [start_id]
    while todo:
        i = index[todo.pop()]
        for j, other in enumerate(rows):
            if other["id"] in seen:
                continue
            a, b = (rows[i], other) if i < j else (other, rows[i])
            if links(a, b):
                seen.add(other["id"])
                todo.append(other["id"])
    return [r for r in rows if r["id"] in seen]


def kill_chain(events: list[dict]) -> list[dict]:
    """All techniques from the events, no repeats, in kill-chain (tactic) order."""
    tags: dict[str, dict] = {}
    for event in events:
        for tag in event.get("mitre") or []:
            tags.setdefault(tag["technique_id"], tag)
    rank = {tactic: i for i, tactic in enumerate(TACTIC_ORDER)}
    return sorted(tags.values(), key=lambda t: rank.get(t["tactic"], len(rank)))


def incident_title(events: list[dict]) -> str:
    """Built from sanitized account/agent names only. Never from event text."""
    taken_over = [
        e["target"] for i, e in enumerate(events) if any(later["actor"] == e["target"] for later in events[i + 1 :])
    ]
    if taken_over:
        return f"Account takeover chain: {safe_name(taken_over[0])} -> {safe_name(events[-1]['target'])}"
    listeners = len(unique(e["sensor"] for e in events))
    return f"Multi-stage attack by {safe_name(events[0]['actor'])} ({listeners} listeners)"


def refresh_incident(db, incident_id: str, *, previous_level: str | None = None) -> dict:
    """Recompute risk, level, title and MITRE roll-up from the incident's events.

    If the level is different from `previous_level` (None for a new incident), Comms Guard is told.
    """
    events = db.table("events").select("*").eq("incident_id", incident_id).order("created_at").execute().data
    sensors = unique(e["sensor"] for e in events)
    risk = incident_risk([e["risk"] for e in events], len(sensors))
    fields = {"risk": risk, "level": score_to_level(risk), "mitre": kill_chain(events)}
    if events:
        fields["title"] = incident_title(events)
    incident = db.table("incidents").update(fields).eq("id", incident_id).execute().data[0]
    if incident["level"] != previous_level:
        hooks.incident_escalated(events, incident["level"])
    return incident


def correlate(db, event: Event) -> str | None:
    """Attach `event` to an incident if it links to events from another listener.

    Returns the incident id, or None if the event stands alone for now.
    """
    since = iso(parse_ts(event.created_at) - timedelta(minutes=WINDOW_MINUTES))
    query = db.table("events").select("*").eq("source", event.source).gte("created_at", since)
    if event.source == "audience":
        query = query.eq("actor", event.actor)  # each judge is their own attacker
    rows = query.order("created_at").limit(MAX_WINDOW_EVENTS).execute().data

    incident_ids = unique(r["incident_id"] for r in rows if r.get("incident_id"))
    incidents = (
        {i["id"]: i for i in db.table("incidents").select("*").in_("id", incident_ids).execute().data}
        if incident_ids
        else {}
    )
    # Events of a closed / false-positive incident are history: new activity starts a new incident.
    rows = [r for r in rows if incidents.get(r.get("incident_id"), {}).get("status") not in FINISHED]

    linked = _component(rows, event.id)
    if not linked:
        return None
    existing = sorted(
        unique(r["incident_id"] for r in linked if r.get("incident_id") in incidents),
        key=lambda i: incidents[i]["created_at"],
    )
    sensors = unique(r["sensor"] for r in linked)
    if len(sensors) < 2 and not existing:
        return None

    created = not existing
    if created:
        seed = {"title": incident_title(linked), "source": event.source, "status": "new"}
        incident_id = db.table("incidents").insert(seed).execute().data[0]["id"]
    else:
        incident_id = existing[0]
        for duplicate in existing[1:]:  # two incidents turned out to be one attack: merge them
            db.table("events").update({"incident_id": incident_id}).eq("incident_id", duplicate).execute()
            db.table("approvals").update({"incident_id": incident_id}).eq("incident_id", duplicate).execute()
            db.table("incidents").delete().eq("id", duplicate).execute()

    to_attach = [r["id"] for r in linked if r.get("incident_id") != incident_id]
    if to_attach:
        db.table("events").update({"incident_id": incident_id}).in_("id", to_attach).execute()

    previous_level = None if created else incidents[incident_id]["level"]
    incident = refresh_incident(db, incident_id, previous_level=previous_level)
    write_audit(
        db,
        actor="engine:correlation",
        action="incident_opened" if created else "incident_updated",
        detail={
            "incident_id": incident_id,
            "event_id": event.id,
            "risk": incident["risk"],
            "level": incident["level"],
            "listeners": sensors,
        },
    )
    _act_on_level(db, incident)
    return incident_id


def _act_on_level(db, incident: dict) -> None:
    """High: recommend containment. Critical: ask a human right away. Nothing is ever locked here."""
    if incident["status"] not in ("new", "investigating"):
        return
    if incident["level"] == "critical" and incident["source"] == "scripted":
        # Audience incidents never page the approver automatically (30 judges would flood the phone);
        # an analyst can still press Request Containment on them.
        create_approval(db, incident["id"], requested_by="engine:correlation")
    elif incident["level"] in ("high", "critical") and incident["status"] == "new":
        db.table("incidents").update({"status": "investigating"}).eq("id", incident["id"]).execute()
        write_audit(
            db,
            actor="engine:correlation",
            action="containment_recommended",
            detail={"incident_id": incident["id"], "level": incident["level"]},
        )
