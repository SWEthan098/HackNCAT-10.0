// Pure helpers for the incident queue (no React, no browser: unit-testable).
// OWNER: Jordan (P4).

import type { Incident, Source } from "@/lib/types/kairos";

/** Queue order: highest risk first, newest first on ties. */
export function sortIncidents(list: Incident[]): Incident[] {
  return [...list].sort((a, b) => b.risk - a.risk || b.created_at.localeCompare(a.created_at));
}

/** Insert or replace by id (Realtime INSERT/UPDATE both land here), then re-sort. */
export function upsertIncident(list: Incident[], incident: Incident): Incident[] {
  return sortIncidents([incident, ...list.filter((i) => i.id !== incident.id)]);
}

export type QueueFilter = {
  source: Source | "all";
  /** Only incidents that have at least one appeal (ids from GET /appeals). */
  appealsOnly: boolean;
  appealIncidentIds?: ReadonlySet<string>;
};

export function filterIncidents(list: Incident[], filter: QueueFilter): Incident[] {
  return list.filter((i) => {
    if (filter.source !== "all" && i.source !== filter.source) return false;
    if (filter.appealsOnly && !filter.appealIncidentIds?.has(i.id)) return false;
    return true;
  });
}

/**
 * Shape check for incident rows arriving over Realtime. A database row has no event_ids
 * column (events point at incidents, the API composes the list), so it is defaulted.
 */
export function asIncident(row: unknown): Incident | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const ok =
    typeof r.id === "string" &&
    typeof r.created_at === "string" &&
    typeof r.title === "string" &&
    typeof r.risk === "number" &&
    typeof r.level === "string" &&
    typeof r.status === "string" &&
    typeof r.source === "string";
  if (!ok) return null;
  return {
    id: r.id as string,
    created_at: r.created_at as string,
    title: r.title as string,
    risk: r.risk as number,
    level: r.level as Incident["level"],
    status: r.status as Incident["status"],
    source: r.source as Incident["source"],
    summary: typeof r.summary === "string" ? r.summary : null,
    triage_label: typeof r.triage_label === "string" ? r.triage_label : null,
    event_ids: Array.isArray(r.event_ids) ? (r.event_ids as string[]) : [],
    mitre: Array.isArray(r.mitre) ? (r.mitre as Incident["mitre"]) : [],
  };
}

/** "840 ms" under a second, "1.4 s" from there; a dash when there are no decisions yet. */
export function formatDecisionTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "–";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export const STATUS_LABELS: Record<Incident["status"], string> = {
  new: "New",
  investigating: "Investigating",
  awaiting_approval: "Awaiting approval",
  contained: "Contained",
  closed: "Closed",
  false_positive: "False positive",
};
