// Pure helpers for the incident queue (no React, no browser: unit-testable).
// OWNER: Jordan (P4).

import type { Incident, KairosEvent, MitreTag, Sensor, Source } from "@/lib/types/kairos";

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

// ---------------------------------------------------------------------------------------
// Incident detail (checklist step 7)
// ---------------------------------------------------------------------------------------


/** Mirror of engine.EXTRA_SENSOR_BONUS. Display only: the API's incident.risk is the truth. */
export const EXTRA_LISTENER_BONUS = 15;

export type ScoreBreakdown = {
  /** The highest-scoring event, which sets the base. */
  base: { eventId: string; risk: number } | null;
  /** Distinct listeners involved, in first-seen order. */
  sensors: Sensor[];
  bonus: number;
  /** base + bonus, capped at 100. */
  total: number;
  capped: boolean;
};

/**
 * Re-derives the published formula (highest event + 15 per extra listener, max 100) so the
 * screen can SHOW the math. It never replaces the server's score: the page compares the two
 * and says so if they differ.
 */
export function scoreBreakdown(events: KairosEvent[]): ScoreBreakdown {
  if (events.length === 0) return { base: null, sensors: [], bonus: 0, total: 0, capped: false };
  const top = events.reduce((a, b) => (b.risk > a.risk ? b : a));
  const sensors = [...new Set(events.map((e) => e.sensor))];
  const bonus = EXTRA_LISTENER_BONUS * Math.max(0, sensors.length - 1);
  const raw = top.risk + bonus;
  return { base: { eventId: top.id, risk: top.risk }, sensors, bonus, total: Math.min(100, raw), capped: raw > 100 };
}

/** Mirror of TACTIC_ORDER in api/schemas/mitre.py (kill-chain order). */
export const TACTIC_ORDER = [
  "Credential Access",
  "Initial Access",
  "Lateral Movement",
  "Defense Evasion",
  "Execution",
  "Privilege Escalation",
  "Exfiltration",
  "Impact",
];

export type KillChainStep = {
  tactic: string;
  techniques: MitreTag[];
  /** Every event that carried one of this tactic's techniques was blocked. */
  blocked: boolean;
};

/** Group an incident's techniques by tactic, in kill-chain order, deduped by technique id. */
export function killChain(events: KairosEvent[]): KillChainStep[] {
  const byTactic = new Map<string, { techniques: Map<string, MitreTag>; verdicts: string[] }>();
  for (const e of events) {
    for (const t of e.mitre) {
      const step = byTactic.get(t.tactic) ?? { techniques: new Map<string, MitreTag>(), verdicts: [] as string[] };
      step.techniques.set(t.technique_id, t);
      step.verdicts.push(e.verdict);
      byTactic.set(t.tactic, step);
    }
  }
  const rank = (tactic: string) => {
    const i = TACTIC_ORDER.indexOf(tactic);
    return i === -1 ? TACTIC_ORDER.length : i; // unknown tactics go last, never dropped
  };
  return [...byTactic.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([tactic, s]) => ({
      tactic,
      techniques: [...s.techniques.values()],
      blocked: s.verdicts.length > 0 && s.verdicts.every((v) => v === "blocked"),
    }));
}

const ATTACK_ID = /^T\d{4}(\.\d{3})?$/;
const ATLAS_ID = /^AML\.T\d{4}(\.\d{3})?$/;

/**
 * Official MITRE page for a technique, or null if the id doesn't look like one. The URL is
 * built from a validated id on a fixed host, never taken from data, so no data can link out
 * to an arbitrary domain.
 */
export function mitreUrl(tag: MitreTag): string | null {
  if (tag.framework === "ATTACK" && ATTACK_ID.test(tag.technique_id)) {
    return `https://attack.mitre.org/techniques/${tag.technique_id.replace(".", "/")}/`;
  }
  if (tag.framework === "ATLAS" && ATLAS_ID.test(tag.technique_id)) {
    return `https://atlas.mitre.org/techniques/${tag.technique_id}`;
  }
  return null;
}

/** Events oldest first, for a timeline. */
export function chronological(events: KairosEvent[]): KairosEvent[] {
  return [...events].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
