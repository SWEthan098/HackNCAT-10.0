// Kairos shared data contract. OWNER: Jordan (P4). FROZEN after the scaffold merges.
// Mirrors api/schemas/kairos.py exactly. If the backend contract changes, Daylen changes the
// Python and Jordan changes this file in the same small PR.

export type Sensor = "login_guard" | "comms_guard" | "agent_firewall";
export type Source = "scripted" | "audience";
export type Level = "low" | "medium" | "high" | "critical";
export type Verdict = "allowed" | "flagged" | "blocked";
export type IncidentStatus = "new" | "investigating" | "awaiting_approval" | "contained" | "closed" | "false_positive";
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export type MitreTag = { framework: "ATTACK" | "ATLAS"; tactic: string; technique_id: string; name: string };

export type KairosEvent = {
  id: string;
  created_at: string;
  sensor: Sensor;
  actor: string;
  target: string;
  source: Source;
  action: string;
  risk: number;
  level: Level;
  verdict: Verdict;
  reason: string;
  mitre: MitreTag[];
  incident_id: string | null;
};

export type Detection = { flagged: boolean; confidence: number; technique: string | null; explanation: string };

export type Incident = {
  id: string;
  created_at: string;
  title: string;
  risk: number;
  level: Level;
  status: IncidentStatus;
  source: Source;
  summary: string | null;
  triage_label: string | null;
  event_ids: string[];
  mitre: MitreTag[];
};
export type IncidentDetail = Incident & { events: KairosEvent[] };

export type Approval = {
  id: string;
  incident_id: string;
  status: ApprovalStatus;
  summary: string;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

// ---- Request / response bodies (one per endpoint) ----
export type AgentRunRequest = { user_request: string; mode?: "protected" | "unprotected" };
export type Decision = { tool: string; verdict: Verdict; layer: string | null; reason: string };
export type AgentRunResponse = { output: string; decisions: Decision[] };

export type AttackRequest = { message: string; delivery?: "direct" | "email"; nickname: string };
export type LayerResult = { name: string; status: "passed" | "blocked" | "skipped" };
export type AttackResponse = {
  verdict: Verdict;
  blocked_by: string | null;
  reason: string;
  layers: LayerResult[];
  technique: MitreTag | null;
  breach: boolean;
};

export type AnalystAskResponse = { answer: string; citations: string[] };
export type SensorResponse = { verdict: Verdict; detection: Detection };

export type RedteamStage = "credential_stuffing" | "impersonation" | "prompt_injection" | "full_chain";
export type RedteamRunResponse = { log_lines: string[]; outcome: string };

export type AttackType = "password_guessing" | "fake_boss" | "trick_ai" | "full_attack";
export type PlaygroundLaunchRequest = { attack_type: AttackType; settings?: Record<string, unknown>; nickname: string };
export type PlaygroundLaunchResponse = {
  log_lines: string[];
  outcome: string;
  risk: number;
  response_level: "watched" | "slowed" | "challenged" | "blocked";
};

export type Appeal = {
  id: string;
  created_at: string;
  event_id: string | null;
  incident_id: string | null;
  reason: string;
  status: "open" | "accepted" | "rejected";
};
export type AuditVerifyResponse = { ok: boolean; entries_checked: number; first_bad_entry: string | null };
export type Stats = {
  attacks_blocked: number;
  breaches: number;
  false_positives: number;
  avg_decision_ms: number;
  open_incidents: Record<Level, number>;
};
export type OkResponse = { ok: boolean; detail: string | null };
