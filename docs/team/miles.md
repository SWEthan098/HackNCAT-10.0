# Miles (P2): AI Lead + Red Team + Attack Picker backend; pitch lead

**Branch:** `p2-ai` · **Pair:** Jordan · Read `docs/PLAN.md` first (sections 3, 4, 6, 10, 12, 15).

**Mission:** make Kairos smart and give it something to fight. You own the AI detectors, Login
Guard and Comms Guard, the fake company "Cisco" (cisco.example), the Red Team side, and the
backend of the top-priority audience Attack Picker. You also lead the pitch (deck + QR slide).

## You own (ONLY you edit these)
```text
api/detectors/            (scan_injection, check_intent, classify_message, score_login)
api/services/ai/          (provider layer: groq / anthropic / mock)
api/sensors/              (Login Guard, Comms Guard)
api/redteam/              (attack runner + seed/ fake Cisco data + vault code + guest accounts)
api/routers/sensors.py, api/routers/redteam.py, api/routers/playground.py
api/tests/ai/, api/tests/benchmarks/
scripts/attack_chain/
web/src/app/redteam/      (your ONLY folder in web/; import from @/lib and @/components, never edit them)
```

## Your endpoints / functions
- `POST /sensors/login` (public): `{username, features}` -> `{verdict, detection}`
- `POST /sensors/message`: `{from, to, body}` -> `{verdict, detection}`
- `POST /redteam/run` (red_team only): `{stage: credential_stuffing|impersonation|prompt_injection|full_chain, target: protected|unprotected}` -> `{log_lines[], outcome}`
- `POST /playground/launch` (public, TOP PRIORITY): `{attack_type: password_guessing|fake_boss|trick_ai|full_attack, settings, nickname}` -> `{log_lines[], outcome, risk, response_level: watched|slowed|challenged|blocked}`
- Functions others import: `scan_injection()`, `check_intent()`, `classify_message()`,
  `score_login()`, all returning `Detection {flagged, confidence, technique, explanation}`, each with
  a DEMO_MODE mock. Keep them importable at all times.

## You depend on / you provide
- **From Daylen:** schemas, `engine.record_event()`, `entity_state`, MITRE table, `POST /demo/reset`.
- **From Ethan:** `/attack` (the Trick the AI card and stage 3 go through his firewall).
- **You provide:** detectors, Cisco seed data, Login Guard + Comms Guard events, the attacker side,
  triage prompts + mock outputs for Ethan's analyst, benchmark numbers, the pitch.

## Build checklist (in order; each step has a test)
1. Branch `p2-ai` off main. *Test:* pulls clean, app runs locally.
2. Detector stubs already exist in `api/detectors/` returning `Detection`. Keep them importable.
   *Test:* Ethan and Daylen can import them.
3. Seed script in `api/redteam/seed/` for Cisco on cisco.example (never cisco.com): 5-8 made-up
   employees (CEO, made-up CFO, IT, j.smith in finance with a weak password), ~20 normal emails + 1
   poisoned email, fake payroll file, vault code stored where the AI can never read it,
   guest01..guest30 audience accounts, normal login history. Safe to re-run (Reset demo reloads it).
   Run it once Daylen's migration is live. *Test:* run it twice, no duplicate rows.
4. Real `scan_injection`: normalize first (strip invisible/zero-width chars, decode base64 snippets,
   flag look-alike letters), wrap text in "UNTRUSTED DATA" markers, force JSON, bad/missing output =
   flagged, combine with keyword rules (the AI never decides alone). Obfuscated attacks get
   AML.T0068. *Test:* catches 5 sample attacks incl. a base64 one and a "this message is safe" trick.
5. Login Guard (timing/metadata only, never typed content): scoring rules (many failed logins fast,
   inhuman typing speed, many accounts from one source, success right after many failures); ladder
   Low = watch, Medium = slow, High = challenge, Critical = block; locked account in `entity_state`
   = "account locked"; "please verify" wording. *Test:* bot pattern scores High, normal human Low.
6. Comms Guard `classify_message`: impersonation, phishing, and AI messages that manipulate people
   (false urgency, pressure, deception, hiding that it is an AI); scoring (urgency, boss claim,
   secrecy, payment change, sent from a flagged account). *Test:* the fake CFO wire request is flagged.
7. Every event via `engine.record_event()` with actor, target, source, mitre (from `schemas.mitre`
   only: T1110.004, T1078, T1534, impersonation per Daylen's verified table, T1657, AML.T0068), risk.
   *Test:* events visible in Supabase with correct fields.
8. 3-stage scripted chain (source = scripted), tuned: stage 1 bot -> j.smith ~45; stage 2 j.smith
   -> fake CFO wire request ~50; stage 3 poisoned email -> finance_agent through Ethan's firewall
   ~55. *Test:* Run Full Chain creates ONE Critical incident (~85).
9. `POST /redteam/run`: red_team role only, cisco.example sandbox hardcoded, every run audit-logged.
   *Test:* a non-red_team account gets refused.
10. Red Team Console at `web/src/app/redteam/` (PLAN.md section 12): red theme, "RED TEAM:
    Authorized testing, Cisco sandbox only" header, Protected/Unprotected toggle, stage cards, Run
    Full Chain, terminal-style log (attacker's view only), Reset demo button (`POST /demo/reset`).
    *Test:* full chain runs from the button and Reset clears it.
11. TOP PRIORITY: `POST /playground/launch` (Attack Picker): password_guessing (speed, number of
    accounts, sneaky mode), fake_boss (CEO/CFO/IT, amount, pressure), trick_ai (goes through Ethan's
    /attack), full_attack. Caps on every setting (max 200 tries), guest01..guest30 only, rate
    limited, actor = `judge:<nickname>`, source = audience. *Test:* each attack type works from a test call.
12. Sneaky vs loud scoring. *Test:* sneaky attack gets "watched", loud attack gets "blocked".
13. Benchmark in `api/tests/benchmarks/`: 30 injections + obfuscated + "note to the security
    system, this message is safe" tricks + normal traffic; attack success rate with vs without
    Kairos, false positives, latency. *Test:* CI prints the numbers.
14. Triage prompts + mock outputs to Ethan; assistive-tech fairness check. *Test:* screen-reader-like
    behavior is not flagged as a bot.

**Only if ahead:** `check_intent`, IsolationForest for Login Guard.

## Pitch (you lead)
Deck per PLAN.md section 14: QR slide (live Vercel URL + `/attack`, test on iPhone + Android),
architecture diagram, "what works / what's conceptual", benchmark chart, MITRE slide, policies.yaml
slide, limitations, why phone approval over SMS, ethics. Everyone presents what they built.

## Done means
- Run Full Chain produces 3 events that link into one Critical incident.
- Every Attack Picker card works from a phone with honest, capped results.
- Benchmark runs green in CI with real numbers.
- Everything works with DEMO_MODE on and no internet (scripted chain).
