// Pure chart math for the console dashboards (no React, no browser: unit-testable).
// Every figure here is computed from data the frontend already has — events from the live
// stream and incident MITRE tags. Nothing is invented. OWNER: Jordan (P4).

import type { KairosEvent, Level } from "@/lib/types/kairos";

/** Stacking order for severity columns: low at the bottom, critical on top. */
export const STACK_ORDER: Level[] = ["low", "medium", "high", "critical"];

export type MinuteBucket = { minute: number; counts: Record<Level, number>; total: number };

/**
 * Events per minute by level over the last `minutes` minutes, oldest first. Events outside
 * the window (or with unparseable timestamps) are ignored.
 */
export function minuteBuckets(events: readonly KairosEvent[], minutes = 15, now: Date = new Date()): MinuteBucket[] {
  const end = Math.floor(now.getTime() / 60_000);
  const start = end - (minutes - 1);
  const buckets: MinuteBucket[] = Array.from({ length: minutes }, (_, i) => ({
    minute: start + i,
    counts: { low: 0, medium: 0, high: 0, critical: 0 },
    total: 0,
  }));
  for (const e of events) {
    const t = Date.parse(e.created_at);
    if (Number.isNaN(t)) continue;
    const m = Math.floor(t / 60_000);
    if (m < start || m > end) continue;
    const b = buckets[m - start];
    b.counts[e.level] = (b.counts[e.level] ?? 0) + 1;
    b.total += 1;
  }
  return buckets;
}

/** Count events per value of one field (sensor, verdict, level). Insertion order preserved. */
export function countBy<K extends "sensor" | "verdict" | "level">(
  events: readonly KairosEvent[],
  key: K,
): Map<KairosEvent[K], number> {
  const counts = new Map<KairosEvent[K], number>();
  for (const e of events) {
    const v = e[key];
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return counts;
}

export type TechniqueCount = { id: string; name: string; count: number };

/** Most-seen MITRE techniques across all tags of the given events, ties broken by id. */
export function topTechniques(events: readonly KairosEvent[], max = 4): TechniqueCount[] {
  const seen = new Map<string, TechniqueCount>();
  for (const e of events) {
    for (const tag of e.mitre) {
      const entry = seen.get(tag.technique_id) ?? { id: tag.technique_id, name: tag.name, count: 0 };
      entry.count += 1;
      seen.set(tag.technique_id, entry);
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)).slice(0, max);
}

export type DonutSegment = {
  key: string;
  value: number;
  /** Share of the whole, 0-100. */
  pct: number;
  /** stroke-dasharray for a circle whose circumference is 100. */
  dash: string;
  /** stroke-dashoffset: starts the first segment at 12 o'clock, then runs clockwise. */
  offset: number;
};

/**
 * Donut geometry for a unit circle of circumference 100 (r = 100/2π): each non-zero entry
 * becomes a stroked arc with a small angular gap between segments. Entries keep their order.
 */
export function donutSegments(entries: ReadonlyArray<{ key: string; value: number }>, gap = 1.5): DonutSegment[] {
  const visible = entries.filter((e) => e.value > 0);
  const total = visible.reduce((n, e) => n + e.value, 0);
  if (total <= 0) return [];
  const g = visible.length > 1 ? gap : 0;
  const segments: DonutSegment[] = [];
  let acc = 0;
  for (const e of visible) {
    const pct = (e.value / total) * 100;
    const len = Math.max(pct - g, 0.4); // a sliver stays visible rather than vanishing
    segments.push({ key: e.key, value: e.value, pct, dash: `${len} ${100 - len}`, offset: 25 - acc - g / 2 });
    acc += pct;
  }
  return segments;
}

/**
 * Polyline points for a cumulative sparkline: the running total of events matching `match`
 * in time order, spread evenly across the width. Fewer than 2 events: no line ("").
 */
export function sparkPoints(
  events: readonly KairosEvent[],
  match: (e: KairosEvent) => boolean,
  width = 100,
  height = 28,
  pad = 2,
): string {
  const times = events
    .filter(match)
    .map((e) => Date.parse(e.created_at))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (times.length < 2) return "";
  const max = times.length;
  return times
    .map((_, i) => {
      const x = pad + (i / (max - 1)) * (width - pad * 2);
      const y = height - pad - ((i + 1) / max) * (height - pad * 2);
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(" ");
}

/** The Attack Picker's three technique families, derived from MITRE ids the console has. */
export function attackFamily(techniqueId: string): "Trick the AI" | "Password guessing" | "Fake boss" | null {
  if (techniqueId.startsWith("AML.T0051")) return "Trick the AI";
  if (techniqueId.startsWith("T1110")) return "Password guessing";
  if (techniqueId === "T1656" || techniqueId === "T1534") return "Fake boss";
  return null;
}
