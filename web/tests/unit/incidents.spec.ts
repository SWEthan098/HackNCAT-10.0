import { expect, test } from "@playwright/test";
import { asIncident, filterIncidents, formatDecisionTime, sortIncidents, upsertIncident } from "../../src/lib/incidents";
import type { Incident } from "../../src/lib/types/kairos";

const inc = (over: Partial<Incident>): Incident => ({
  id: "i1",
  created_at: "2026-11-14T12:00:00+00:00",
  title: "t",
  risk: 50,
  level: "medium",
  status: "new",
  source: "scripted",
  summary: null,
  triage_label: null,
  event_ids: [],
  mitre: [],
  ...over,
});

test("sortIncidents: highest risk first, newest first on ties", () => {
  const a = inc({ id: "a", risk: 85 });
  const b = inc({ id: "b", risk: 45 });
  const c = inc({ id: "c", risk: 45, created_at: "2026-11-14T13:00:00+00:00" });
  expect(sortIncidents([b, c, a]).map((i) => i.id)).toEqual(["a", "c", "b"]);
});

test("upsertIncident inserts new rows and replaces existing ones in place", () => {
  const list = [inc({ id: "a", risk: 85 }), inc({ id: "b", risk: 45 })];
  const updated = upsertIncident(list, inc({ id: "b", risk: 90, status: "contained" }));
  expect(updated.map((i) => i.id)).toEqual(["b", "a"]);
  expect(updated[0].status).toBe("contained");
  expect(upsertIncident(list, inc({ id: "c", risk: 60 })).map((i) => i.id)).toEqual(["a", "c", "b"]);
});

test("filterIncidents: source and appeals filters compose", () => {
  const list = [inc({ id: "a", source: "scripted" }), inc({ id: "b", source: "audience" })];
  expect(filterIncidents(list, { source: "audience", appealsOnly: false }).map((i) => i.id)).toEqual(["b"]);
  expect(filterIncidents(list, { source: "all", appealsOnly: true, appealIncidentIds: new Set(["a"]) }).map((i) => i.id)).toEqual(["a"]);
  expect(filterIncidents(list, { source: "audience", appealsOnly: true, appealIncidentIds: new Set(["a"]) })).toEqual([]);
});

test("asIncident accepts a DB row without event_ids and rejects junk", () => {
  const row = {
    id: "x",
    created_at: "2026-11-14T12:00:00+00:00",
    updated_at: "2026-11-14T12:00:00+00:00",
    title: "DB row",
    risk: 70,
    level: "high",
    status: "new",
    source: "audience",
    summary: null,
    triage_label: null,
    mitre: [],
  };
  const parsed = asIncident(row);
  expect(parsed?.event_ids).toEqual([]);
  expect(parsed?.title).toBe("DB row");
  expect(asIncident(null)).toBeNull();
  expect(asIncident({ id: "x" })).toBeNull();
});

test("formatDecisionTime", () => {
  expect(formatDecisionTime(0)).toBe("–");
  expect(formatDecisionTime(840)).toBe("840 ms");
  expect(formatDecisionTime(1440)).toBe("1.4 s");
});
