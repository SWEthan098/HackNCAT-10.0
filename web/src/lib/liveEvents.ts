// Pure helpers for the live event feed (no React, no browser: unit-testable).
// OWNER: Jordan (P4).

import type { KairosEvent, Level, MitreTag } from "@/lib/types/kairos";

/** Newest first, no duplicates (Realtime can re-deliver after a reconnect), capped. */
export function addEvent(list: KairosEvent[], event: KairosEvent, cap = 100): KairosEvent[] {
  if (list.some((e) => e.id === event.id)) return list;
  return [event, ...list].slice(0, cap);
}

/** The published risk bands (engine.score_to_level). Used ONLY to keep demo data consistent. */
export function levelForRisk(risk: number): Level {
  if (risk >= 85) return "critical";
  if (risk >= 60) return "high";
  if (risk >= 30) return "medium";
  return "low";
}

const tag = (framework: "ATTACK" | "ATLAS", tactic: string, technique_id: string, name: string): MitreTag => ({
  framework,
  tactic,
  technique_id,
  name,
});

// A believable slice of the fake company so the feed can be designed and demoed with the
// database unreachable. The UI labels these clearly as demo data; they never claim to be real.
const DEMO_TEMPLATES: Array<Omit<KairosEvent, "id" | "created_at">> = [
  {
    sensor: "login_guard",
    actor: "bot:203.0.113.7",
    target: "j.smith",
    source: "scripted",
    action: "login_burst",
    risk: 45,
    level: "medium",
    verdict: "flagged",
    reason: "41 failed logins in 60s, then a success. Asked for verification instead of blocking.",
    mitre: [tag("ATTACK", "Credential Access", "T1110.004", "Brute Force: Credential Stuffing")],
    incident_id: null,
  },
  {
    sensor: "comms_guard",
    actor: "j.smith",
    target: "a.reyes",
    source: "scripted",
    action: "message_scan",
    risk: 50,
    level: "medium",
    verdict: "flagged",
    reason: "Message claims to be the CFO, asks for secrecy and an urgent wire change.",
    mitre: [tag("ATTACK", "Lateral Movement", "T1534", "Internal Spearphishing")],
    incident_id: null,
  },
  {
    sensor: "agent_firewall",
    actor: "j.smith",
    target: "finance_agent",
    source: "scripted",
    action: "send_email",
    risk: 55,
    level: "medium",
    verdict: "blocked",
    reason: "Email draft to an outside address came from untrusted content. Held for approval.",
    mitre: [tag("ATLAS", "Execution", "AML.T0051.001", "LLM Prompt Injection: Indirect")],
    incident_id: null,
  },
  {
    sensor: "login_guard",
    actor: "judge:falcon",
    target: "guest07",
    source: "audience",
    action: "login_burst",
    risk: 22,
    level: "low",
    verdict: "allowed",
    reason: "Slow guesses from one source. Watching, no action taken.",
    mitre: [tag("ATTACK", "Credential Access", "T1110.004", "Brute Force: Credential Stuffing")],
    incident_id: null,
  },
  {
    sensor: "agent_firewall",
    actor: "judge:mantis",
    target: "finance_agent",
    source: "audience",
    action: "send_email",
    risk: 88,
    level: "critical",
    verdict: "blocked",
    reason: "Output matched the vault canary. Blocked before anything left, approval requested.",
    mitre: [tag("ATLAS", "Exfiltration", "AML.T0057", "LLM Data Leakage")],
    incident_id: null,
  },
];

/** Deterministic demo event n (0, 1, 2, ...): same n, same event. */
export function demoEvent(n: number, now: Date = new Date()): KairosEvent {
  const t = DEMO_TEMPLATES[n % DEMO_TEMPLATES.length];
  return { ...t, id: `demo-${n}`, created_at: now.toISOString() };
}

/** Shape check for rows arriving over Realtime (defense in depth; the DB enforces this too). */
export function isKairosEvent(row: unknown): row is KairosEvent {
  if (typeof row !== "object" || row === null) return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.created_at === "string" &&
    typeof r.sensor === "string" &&
    typeof r.actor === "string" &&
    typeof r.target === "string" &&
    typeof r.action === "string" &&
    typeof r.risk === "number" &&
    typeof r.level === "string" &&
    typeof r.verdict === "string" &&
    typeof r.reason === "string"
  );
}
