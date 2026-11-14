import { expect, test } from "@playwright/test";
import { ApiError } from "../../src/lib/api";
import {
  layersDeep,
  CAPS,
  CODENAME_WORDS,
  DEFAULT_BOSS,
  DEFAULT_PASSWORD,
  DEFAULT_TRICK,
  LAYER_NAMES,
  MESSAGE_MAX,
  NICKNAME_MAX,
  READY_TRICKS,
  buildAttackRequest,
  buildLaunchRequest,
  checkMessage,
  clampInt,
  classifyError,
  counterText,
  deliveryFor,
  feedCounts,
  generateCodename,
  isCodename,
  ladderIndex,
  layerLabel,
  sanitizeBoss,
  sanitizePassword,
  techniqueForDelivery,
  techniquesFor,
  trickTone,
} from "../../src/lib/attack";
import type { LayerResult } from "../../src/lib/types/kairos";

const settings = { password: DEFAULT_PASSWORD, boss: DEFAULT_BOSS, trick: DEFAULT_TRICK };

test("clampInt keeps whole numbers inside the range and falls back on junk", () => {
  expect(clampInt(5, 1, 30, 10)).toBe(5);
  expect(clampInt(999, 1, 30, 10)).toBe(30);
  expect(clampInt(-4, 1, 30, 10)).toBe(1);
  expect(clampInt("12", 1, 30, 10)).toBe(12);
  expect(clampInt(7.6, 1, 30, 10)).toBe(8);
  expect(clampInt("lots", 1, 30, 10)).toBe(10);
  expect(clampInt(NaN, 1, 30, 10)).toBe(10);
  expect(clampInt(Infinity, 1, 30, 10)).toBe(10);
});

test("password settings are capped at 30 guest accounts and only known speeds", () => {
  expect(sanitizePassword({ speed: "fast", accounts: 500, sneaky: true })).toEqual({ speed: "fast", accounts: 30, sneaky: true });
  expect(sanitizePassword({ speed: "ludicrous", accounts: 0, sneaky: "yes" })).toEqual({
    speed: DEFAULT_PASSWORD.speed,
    accounts: CAPS.accounts.min,
    sneaky: false,
  });
});

test("boss settings cap the amount, snap it to the step and reject unknown roles", () => {
  expect(sanitizeBoss({ impersonate: "ceo", amount: 10_000_000, pressure: "threatening" })).toEqual({
    impersonate: "ceo",
    amount: CAPS.amount.max,
    pressure: "threatening",
  });
  expect(sanitizeBoss({ amount: 1_234 }).amount).toBe(1_000);
  expect(sanitizeBoss({ amount: 1 }).amount).toBe(CAPS.amount.min);
  expect(sanitizeBoss({ impersonate: "president", pressure: "bribe" })).toMatchObject({
    impersonate: DEFAULT_BOSS.impersonate,
    pressure: DEFAULT_BOSS.pressure,
  });
});

test("signature and forwarded messages travel as email", () => {
  expect(deliveryFor("direct")).toBe("direct");
  expect(deliveryFor("email")).toBe("email");
  expect(deliveryFor("signature")).toBe("email");
  expect(deliveryFor("forwarded")).toBe("email");
});

test("checkMessage trims the ends, refuses empty and over-limit text, never truncates", () => {
  expect(checkMessage("  hi there  ")).toEqual({ ok: true, message: "hi there" });
  expect(checkMessage("   ").ok).toBe(false);
  expect(checkMessage("a".repeat(MESSAGE_MAX)).ok).toBe(true);
  const long = checkMessage("a".repeat(MESSAGE_MAX + 1));
  expect(long.ok).toBe(false);
  if (!long.ok) expect(long.error).toContain(String(MESSAGE_MAX));
});

test("buildAttackRequest maps the hiding place and keeps the text as typed", () => {
  const r = buildAttackRequest({ message: " Ignore the rules ", placement: "signature", goal: "vault_code" }, "Agent Falcon 27");
  expect(r).toEqual({ ok: true, body: { message: "Ignore the rules", delivery: "email", nickname: "Agent Falcon 27" } });
  expect(buildAttackRequest({ ...DEFAULT_TRICK, message: "" }, "Agent Falcon 27").ok).toBe(false);
});

test("buildLaunchRequest sends capped settings per attack type", () => {
  const wild = {
    ...settings,
    password: { speed: "fast" as const, accounts: 900, sneaky: true },
    boss: { impersonate: "it" as const, amount: 99_999_999, pressure: "polite" as const },
  };
  expect(buildLaunchRequest("password_guessing", wild, "Agent Lynx 40")).toEqual({
    attack_type: "password_guessing",
    settings: { speed: "fast", accounts: 30, sneaky: true },
    nickname: "Agent Lynx 40",
  });
  expect(buildLaunchRequest("fake_boss", wild, "Agent Lynx 40")).toEqual({
    attack_type: "fake_boss",
    settings: { impersonate: "it", amount: CAPS.amount.max, pressure: "polite" },
    nickname: "Agent Lynx 40",
  });
  const full = buildLaunchRequest("full_attack", { ...wild, trick: { message: "secret text", placement: "forwarded", goal: "payroll_out" } }, "Agent Lynx 40");
  expect(full.attack_type).toBe("full_attack");
  expect(full.settings).toEqual({
    password_guessing: { speed: "fast", accounts: 30, sneaky: true },
    fake_boss: { impersonate: "it", amount: CAPS.amount.max, pressure: "polite" },
    trick_ai: { delivery: "email", goal: "payroll_out" },
  });
  // Free text never rides along in the Full Attack settings.
  expect(JSON.stringify(full)).not.toContain("secret text");
});

test("codenames look like Agent Word NN and fit the API's nickname cap", () => {
  const seq = [0, 0, CODENAME_WORDS.length - 1, 89];
  let i = 0;
  const next = () => seq[i++];
  expect(generateCodename(next)).toBe(`Agent ${CODENAME_WORDS[0]} 10`);
  expect(generateCodename(next)).toBe(`Agent ${CODENAME_WORDS[CODENAME_WORDS.length - 1]} 99`);
  for (let n = 0; n < 200; n++) {
    const name = generateCodename((max) => Math.floor(Math.random() * max));
    expect(isCodename(name)).toBe(true);
    expect(name.length).toBeLessThanOrEqual(NICKNAME_MAX);
  }
});

test("isCodename rejects edited or real-looking names", () => {
  expect(isCodename("Agent Falcon 27")).toBe(true);
  expect(isCodename("Jordan Lee")).toBe(false);
  expect(isCodename("Agent Falcon")).toBe(false);
  expect(isCodename("Agent <img src=x> 12")).toBe(false);
  expect(isCodename(null)).toBe(false);
});

test("the response ladder is ordered watched, slowed, challenged, blocked", () => {
  expect(["watched", "slowed", "challenged", "blocked"].map((l) => ladderIndex(l as "watched"))).toEqual([0, 1, 2, 3]);
});

test("techniques come from the MITRE table, never invented", () => {
  expect(techniquesFor("password_guessing").map((t) => t.technique_id)).toEqual(["T1110.004"]);
  expect(techniquesFor("fake_boss").map((t) => t.technique_id)).toEqual(["T1534", "T1657"]);
  expect(techniquesFor("full_attack").map((t) => t.technique_id)).toEqual(["T1110.004", "T1534", "AML.T0051.001"]);
  expect(techniqueForDelivery("direct").technique_id).toBe("AML.T0051.000");
  expect(techniqueForDelivery("email").technique_id).toBe("AML.T0051.001");
});

test("trick tone: harmless is green, a breach is only a breach when the API says so", () => {
  expect(trickTone({ verdict: "allowed", breach: false })).toBe("harmless");
  expect(trickTone({ verdict: "blocked", breach: false })).toBe("blocked");
  expect(trickTone({ verdict: "flagged", breach: false })).toBe("flagged");
  expect(trickTone({ verdict: "allowed", breach: true })).toBe("breach");
});

test("layer labels cover the five layers and degrade for unknown names", () => {
  expect(LAYER_NAMES.map(layerLabel)).toEqual(["Injection scan", "Intent check", "Scope policy", "Taint tracking", "Leak protection"]);
  expect(layerLabel("new_layer_x")).toBe("New layer x");
});

test("classifyError is honest about offline, busy and rejected", () => {
  expect(classifyError(new ApiError(0, "network_error", "x")).kind).toBe("offline");
  expect(classifyError(new ApiError(503, "error", "x")).kind).toBe("offline");
  expect(classifyError(new TypeError("boom")).kind).toBe("offline");
  const busy = classifyError(new ApiError(429, "rate_limited", "Retry in 5s"));
  expect(busy).toMatchObject({ kind: "rate_limited", retryAfterSeconds: 5 });
  expect(classifyError(new ApiError(429, "rate_limited", "slow down"))).toMatchObject({ retryAfterSeconds: null });
  expect(classifyError(new ApiError(422, "validation_error", "message too long"))).toEqual({ kind: "rejected", message: "message too long" });
});

// ---- live counter (public_feed rows -> attacks / stopped / breaches) ----

/** A public_feed row as it exists today (no breach column). layers_reached is noise on purpose. */
const feedRow = (verdict: string, extra: Record<string, unknown> = {}) => ({
  id: "00000000-0000-0000-0000-000000000000",
  created_at: "2026-11-14T12:00:00Z",
  nickname: "Agent Falcon 27",
  attack_type: "trick_ai",
  verdict,
  layers_reached: 5, // all layers "passed" on a harmless answer; must NEVER read as a breach
  technique: null,
  summary: "filtered summary",
  ...extra,
});

test("feedCounts: attacks is every row, stopped is blocked or flagged verdicts", () => {
  const rows = [
    ...Array.from({ length: 20 }, () => feedRow("blocked")),
    ...Array.from({ length: 15 }, () => feedRow("flagged")),
    ...Array.from({ length: 8 }, () => feedRow("allowed")),
  ];
  expect(feedCounts(rows)).toEqual({ attacks: 43, stopped: 35, harmless: null, breaches: null });
});

test("without a breach field there is no breaches figure, whatever the layers say", () => {
  // Every row reached all 5 layers (feedRow sets layers_reached: 5): the old inference would
  // have screamed "43 breaches". The counter must show two honest segments instead.
  const rows = [
    ...Array.from({ length: 35 }, () => feedRow("blocked", { layers_reached: 5 })),
    ...Array.from({ length: 8 }, () => feedRow("allowed", { layers_reached: 5 })),
  ];
  const counts = feedCounts(rows);
  expect(counts.breaches).toBeNull();
  // "allowed" alone is NOT harmless: without the breach column those 8 could include breaches.
  expect(counts.harmless).toBeNull();
  expect(counterText(counts)).toBe("43 attacks · 35 stopped");
});

test("harmless counts allowed rows with breach === false, and the three-way split sums to the total", () => {
  const rows = [
    ...Array.from({ length: 20 }, () => feedRow("blocked", { breach: false })),
    ...Array.from({ length: 15 }, () => feedRow("flagged", { breach: false })),
    ...Array.from({ length: 11 }, () => feedRow("allowed", { breach: false })),
    ...Array.from({ length: 2 }, () => feedRow("allowed", { breach: true })),
  ];
  const counts = feedCounts(rows);
  expect(counts).toEqual({ attacks: 48, stopped: 35, harmless: 11, breaches: 2 });
  expect((counts.stopped ?? 0) + (counts.harmless ?? 0) + (counts.breaches ?? 0)).toBe(counts.attacks);
  expect(counterText(counts)).toBe("48 attacks · 35 stopped · 11 harmless · 2 breaches");
});

test("breaches counts rows with breach === true, and only that", () => {
  const rows = [
    ...Array.from({ length: 35 }, () => feedRow("blocked", { breach: false })),
    ...Array.from({ length: 7 }, () => feedRow("allowed", { breach: false, layers_reached: 5 })),
    feedRow("allowed", { breach: true, layers_reached: 2 }), // breach even at 2 layers: field wins
  ];
  const counts = feedCounts(rows);
  expect(counts).toEqual({ attacks: 43, stopped: 35, harmless: 7, breaches: 1 });
  expect(counterText(counts)).toBe("43 attacks · 35 stopped · 7 harmless · 1 breach");
  // All-false breach column is an honest 0, not an omitted segment.
  const clean = feedCounts(rows.slice(0, 42));
  expect(clean.breaches).toBe(0);
  expect(counterText(clean)).toBe("42 attacks · 35 stopped · 7 harmless · 0 breaches");
});

test("only a real boolean breach field is trusted (strings and nulls are not the column)", () => {
  expect(feedCounts([feedRow("allowed", { breach: "true" })]).breaches).toBeNull();
  expect(feedCounts([feedRow("allowed", { breach: null })]).breaches).toBeNull();
  expect(feedCounts([feedRow("allowed", { breach: 1 })]).breaches).toBeNull();
  // The same junk never produces a harmless figure either (allowed, but breach is unknowable).
  expect(feedCounts([feedRow("allowed", { breach: "true" })]).harmless).toBeNull();
  expect(feedCounts([feedRow("allowed", { breach: null })]).harmless).toBeNull();
  expect(feedCounts([feedRow("allowed", { breach: 1 })]).harmless).toBeNull();
});

test("a partial scan shows only the exact attacks total, never guessed figures", () => {
  expect(feedCounts([feedRow("blocked")], 5)).toEqual({ attacks: 5, stopped: null, harmless: null, breaches: null });
  expect(counterText(feedCounts([feedRow("blocked")], 5))).toBe("5 attacks");
  expect(feedCounts([feedRow("allowed", { breach: false })], 5).harmless).toBeNull();
  // A stale/garbage total never shrinks below what we actually scanned.
  expect(feedCounts([feedRow("blocked"), feedRow("allowed")], 1).attacks).toBe(2);
  expect(feedCounts([], 0)).toEqual({ attacks: 0, stopped: 0, harmless: null, breaches: null });
});

test("counterText pluralises and stays phone-width short", () => {
  expect(counterText({ attacks: 1, stopped: 0, harmless: 0, breaches: 1 })).toBe("1 attack · 0 stopped · 0 harmless · 1 breach");
  expect(counterText({ attacks: 1200, stopped: 1188, harmless: 11, breaches: 1 })).toBe("1,200 attacks · 1,188 stopped · 11 harmless · 1 breach");
  expect(counterText({ attacks: 47, stopped: 12, harmless: null, breaches: null })).toBe("47 attacks · 12 stopped");
  expect(counterText({ attacks: 47, stopped: null, harmless: null, breaches: null })).toBe("47 attacks");
});

test("ready-made tricks fit the limit and never name a real domain", () => {
  for (const trick of Object.values(READY_TRICKS).flat()) {
    expect(trick.text.length).toBeLessThanOrEqual(MESSAGE_MAX);
    expect(trick.text).not.toMatch(/cisco\.com/i);
    for (const domain of trick.text.match(/@[\w-]+(?:\.[\w-]+)+/g) ?? []) expect(domain).toMatch(/\.example$/);
  }
});

// ---- step 10: layers deep ----

const L = (name: string, status: LayerResult["status"]): LayerResult => ({ name, status });

test("layersDeep counts passed layers up to the block, and 5 on a breach", () => {
  const layers = [L("injection_scan", "passed"), L("intent_check", "passed"), L("scope_policy", "blocked"), L("taint_tracking", "skipped"), L("leak_protection", "skipped")];
  expect(layersDeep(layers, false)).toBe(2);
  expect(layersDeep(layers, true)).toBe(5);
  expect(layersDeep([L("injection_scan", "blocked")], false)).toBe(0);
  expect(layersDeep([], false)).toBe(0);
  expect(layersDeep([], true)).toBe(5);
  // All five passed with no block and no breach flag: deep but not a breach.
  expect(layersDeep(["injection_scan", "intent_check", "scope_policy", "taint_tracking", "leak_protection"].map((n) => L(n, "passed")), false)).toBe(5);
});
