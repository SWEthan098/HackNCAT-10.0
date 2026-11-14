import { expect, test } from "@playwright/test";
import {
  asIncident,
  chronological,
  filterIncidents,
  formatDecisionTime,
  killChain,
  mitreUrl,
  scoreBreakdown,
  sortIncidents,
  classifyCitation,
  upsertIncident,
} from "../../src/lib/incidents";
import type { Incident, KairosEvent } from "../../src/lib/types/kairos";

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

// ---- incident detail ----

const ev = (over: Partial<KairosEvent>): KairosEvent => ({
  id: "e",
  created_at: "2026-11-14T12:00:00+00:00",
  sensor: "login_guard",
  actor: "a",
  target: "b",
  source: "scripted",
  action: "x",
  risk: 10,
  level: "low",
  verdict: "flagged",
  reason: "r",
  mitre: [],
  incident_id: "i",
  ...over,
});

const T = (framework: "ATTACK" | "ATLAS", tactic: string, technique_id: string) => ({ framework, tactic, technique_id, name: technique_id });

test("scoreBreakdown reproduces the demo chain: 55 + 15 + 15 = 85", () => {
  const b = scoreBreakdown([
    ev({ id: "e1", sensor: "login_guard", risk: 45 }),
    ev({ id: "e2", sensor: "comms_guard", risk: 50 }),
    ev({ id: "e3", sensor: "agent_firewall", risk: 55 }),
  ]);
  expect(b.base).toEqual({ eventId: "e3", risk: 55 });
  expect(b.sensors).toEqual(["login_guard", "comms_guard", "agent_firewall"]);
  expect(b.bonus).toBe(30);
  expect(b.total).toBe(85);
  expect(b.capped).toBe(false);
});

test("scoreBreakdown: same listener twice adds no bonus; the cap is 100", () => {
  expect(scoreBreakdown([ev({ risk: 40 }), ev({ id: "e2", risk: 60 })]).total).toBe(60);
  const capped = scoreBreakdown([ev({ risk: 100, sensor: "agent_firewall" }), ev({ id: "e2", sensor: "comms_guard" })]);
  expect(capped.total).toBe(100);
  expect(capped.capped).toBe(true);
  expect(scoreBreakdown([]).total).toBe(0);
});

test("killChain orders tactics, dedupes techniques and marks fully blocked steps", () => {
  const steps = killChain([
    ev({ id: "e3", verdict: "blocked", mitre: [T("ATLAS", "Exfiltration", "AML.T0057"), T("ATLAS", "Execution", "AML.T0051.001")] }),
    ev({ id: "e1", verdict: "flagged", mitre: [T("ATTACK", "Credential Access", "T1110.004")] }),
    ev({ id: "e2", verdict: "flagged", mitre: [T("ATTACK", "Credential Access", "T1110.004"), T("ATTACK", "Mystery Tactic", "T9999")] }),
  ]);
  expect(steps.map((s) => s.tactic)).toEqual(["Credential Access", "Execution", "Exfiltration", "Mystery Tactic"]);
  expect(steps[0].techniques).toHaveLength(1);
  expect(steps.find((s) => s.tactic === "Exfiltration")?.blocked).toBe(true);
  expect(steps[0].blocked).toBe(false);
});

test("mitreUrl only builds official URLs from well-formed ids", () => {
  expect(mitreUrl(T("ATTACK", "x", "T1110.004"))).toBe("https://attack.mitre.org/techniques/T1110/004/");
  expect(mitreUrl(T("ATTACK", "x", "T1534"))).toBe("https://attack.mitre.org/techniques/T1534/");
  expect(mitreUrl(T("ATLAS", "x", "AML.T0051.001"))).toBe("https://atlas.mitre.org/techniques/AML.T0051.001");
  expect(mitreUrl(T("ATTACK", "x", "T1110/../../evil"))).toBeNull();
  expect(mitreUrl(T("ATLAS", "x", "https://evil.example"))).toBeNull();
});

test("chronological sorts oldest first without mutating the input", () => {
  const input = [ev({ id: "b", created_at: "2026-11-14T12:00:02Z" }), ev({ id: "a", created_at: "2026-11-14T12:00:01Z" })];
  expect(chronological(input).map((e) => e.id)).toEqual(["a", "b"]);
  expect(input[0].id).toBe("b");
});

// ---- analyst citations ----

test("classifyCitation links MITRE ids and leaves event ids as plain labels", () => {
  expect(classifyCitation("AML.T0051.001")).toEqual({ raw: "AML.T0051.001", kind: "atlas", href: "https://atlas.mitre.org/techniques/AML.T0051.001" });
  expect(classifyCitation("T1110.004")).toEqual({ raw: "T1110.004", kind: "attack", href: "https://attack.mitre.org/techniques/T1110/004/" });
  expect(classifyCitation("evt-3").kind).toBe("event");
  expect(classifyCitation("evt-3").href).toBeNull();
  expect(classifyCitation(" T1534 ").href).toBe("https://attack.mitre.org/techniques/T1534/");
});
