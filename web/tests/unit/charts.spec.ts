import { expect, test } from "@playwright/test";
import { attackFamily, countBy, donutSegments, minuteBuckets, sparkPoints, topTechniques } from "../../src/lib/charts";
import type { KairosEvent, Level, MitreTag } from "../../src/lib/types/kairos";

const tag = (technique_id: string, name = technique_id): MitreTag => ({ framework: "ATTACK", tactic: "x", technique_id, name });

const ev = (over: Partial<KairosEvent>): KairosEvent => ({
  id: Math.random().toString(36).slice(2),
  created_at: new Date().toISOString(),
  sensor: "login_guard",
  actor: "a",
  target: "t",
  source: "scripted",
  action: "x",
  risk: 10,
  level: "low" as Level,
  verdict: "allowed",
  reason: "r",
  mitre: [],
  incident_id: null,
  ...over,
});

test("minuteBuckets puts events in the right minute, ignores out-of-window and bad dates", () => {
  const now = new Date("2026-11-14T12:14:30Z");
  const at = (iso: string, level: Level) => ev({ created_at: iso, level });
  const buckets = minuteBuckets(
    [
      at("2026-11-14T12:14:05Z", "critical"), // current minute (last bucket)
      at("2026-11-14T12:14:59Z", "low"),
      at("2026-11-14T12:00:00Z", "medium"), // first bucket of a 15-minute window
      at("2026-11-14T11:59:59Z", "high"), // just outside
      at("2026-11-14T12:20:00Z", "high"), // the future is outside too
      ev({ created_at: "not a date" }),
    ],
    15,
    now,
  );
  expect(buckets).toHaveLength(15);
  expect(buckets[14].counts.critical).toBe(1);
  expect(buckets[14].counts.low).toBe(1);
  expect(buckets[14].total).toBe(2);
  expect(buckets[0].counts.medium).toBe(1);
  expect(buckets.reduce((n, b) => n + b.total, 0)).toBe(3);
});

test("countBy counts per field value", () => {
  const counts = countBy(
    [ev({ verdict: "blocked" }), ev({ verdict: "blocked" }), ev({ verdict: "flagged" }), ev({ verdict: "allowed" })],
    "verdict",
  );
  expect(counts.get("blocked")).toBe(2);
  expect(counts.get("flagged")).toBe(1);
  expect(counts.get("allowed")).toBe(1);
});

test("topTechniques ranks by count across all tags, ties by id, capped", () => {
  const events = [
    ev({ mitre: [tag("T1110.004"), tag("AML.T0051.001")] }),
    ev({ mitre: [tag("T1110.004")] }),
    ev({ mitre: [tag("T1656")] }),
    ev({ mitre: [tag("AML.T0051.001")] }),
    ev({ mitre: [tag("T1566")] }),
  ];
  const top = topTechniques(events, 3);
  expect(top.map((t) => t.id)).toEqual(["AML.T0051.001", "T1110.004", "T1566"]);
  expect(top[0].count).toBe(2);
});

test("donutSegments: percentages sum to 100, zero entries dropped, dasharray sums to 100", () => {
  const segs = donutSegments([
    { key: "a", value: 4 },
    { key: "b", value: 0 },
    { key: "c", value: 8 },
    { key: "d", value: 4 },
  ]);
  expect(segs.map((s) => s.key)).toEqual(["a", "c", "d"]);
  expect(segs.reduce((n, s) => n + s.pct, 0)).toBeCloseTo(100);
  for (const s of segs) {
    const [len, rest] = s.dash.split(" ").map(Number);
    expect(len + rest).toBeCloseTo(100);
    expect(len).toBeGreaterThan(0);
  }
});

test("donutSegments: empty and single-entry cases", () => {
  expect(donutSegments([{ key: "a", value: 0 }])).toEqual([]);
  expect(donutSegments([])).toEqual([]);
  const [only] = donutSegments([{ key: "a", value: 7 }]);
  expect(only.pct).toBeCloseTo(100);
  expect(only.dash).toBe("100 0"); // no gap when there is nothing to separate
});

test("sparkPoints: cumulative, monotonic left-to-right and bounded; too few points -> empty", () => {
  const base = Date.parse("2026-11-14T12:00:00Z");
  const events = [0, 1, 2, 3].map((m) =>
    ev({ created_at: new Date(base + m * 60_000).toISOString(), verdict: "blocked" }),
  );
  const points = sparkPoints(events, (e) => e.verdict === "blocked");
  const coords = points.split(" ").map((p) => p.split(",").map(Number));
  expect(coords).toHaveLength(4);
  for (let i = 1; i < coords.length; i++) {
    expect(coords[i][0]).toBeGreaterThan(coords[i - 1][0]); // x advances
    expect(coords[i][1]).toBeLessThan(coords[i - 1][1]); // cumulative count climbs (y falls)
  }
  for (const [x, y] of coords) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(100);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(28);
  }
  expect(sparkPoints([events[0]], () => true)).toBe("");
  expect(sparkPoints(events, () => false)).toBe("");
});

test("attackFamily maps the picker's three families and nothing else", () => {
  expect(attackFamily("AML.T0051.001")).toBe("Trick the AI");
  expect(attackFamily("T1110.004")).toBe("Password guessing");
  expect(attackFamily("T1656")).toBe("Fake boss");
  expect(attackFamily("T1534")).toBe("Fake boss");
  expect(attackFamily("AML.T0057")).toBeNull();
  expect(attackFamily("T1566")).toBeNull();
});
