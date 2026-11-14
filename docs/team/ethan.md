# Ethan (P1): Firewall Lead + AI Analyst + Deploy Owner

**Branch:** `p1-firewall` · **Pair:** Daylen · Read `docs/PLAN.md` first (sections 5, 8, 10, 17).

**Mission:** build the Agent Firewall (the hero of the demo) and the AI Security Analyst. Every AI
action passes through your code, and the analyst runs through your firewall too. You also own
deployment (Railway + Vercel) and the GitHub repo.

## You own (ONLY you edit these)
```text
api/firewall/            (incl. policies.yaml)
api/agents/              (victim/ = the company's AI assistant)
api/analyst/
api/routers/attack.py
api/routers/analyst.py
api/tests/firewall/
Railway + Vercel settings (dashboards, not code). GitHub repo settings.
```

## Your endpoints
- `POST /agent/run`: `{user_request, mode: protected|unprotected}` -> `{output, decisions[]}`
- `POST /attack` (public): `{message (<=500), delivery: direct|email, nickname}` ->
  `{verdict, blocked_by, reason, layers[{name, status}], technique, breach}`. Layers:
  `injection_scan`, `intent_check`, `scope_policy`, `taint_tracking`, `leak_protection`.
- `POST /analyst/ask`: `{question}` -> `{answer, citations[]}`

## You depend on / you provide
- **From Daylen:** schemas (`api/schemas/kairos.py`), `engine.record_event()`, `score_to_level()`,
  approvals create, `entity_state`, MITRE table (`api/schemas/mitre.py`).
- **From Miles:** `detectors.scan_injection()`, `check_intent()` (stubs exist now), Cisco seed data
  (mailbox, poisoned email, payroll, vault code, guest accounts), triage prompts + mock outputs.
- **You provide:** firewall events, the `/attack` response Jordan builds against, analyst summaries
  Jordan displays, the Trick the AI card's backend, latency numbers for the benchmark.

## Build checklist (in order; each step has a test)
**Deploy first (dashboards, no code)**
1. Access to the repo, Supabase keys (Daylen sends privately), Railway, Vercel. *Test:* you can log in to all four.
2. Railway service: root `api/`, start command from `api/railway.json`, `/health` check, auto-deploy
   on main. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (backend ONLY), `GROQ_API_KEY`,
   `ANTHROPIC_API_KEY`, `AI_PROVIDER`, `DEMO_MODE=false`, `ALLOWED_ORIGINS=<Vercel URL>`.
   *Test:* `/health` responds on the public Railway URL.
3. Vercel: root `web/`, auto-deploy on main. Env: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL=<Railway URL>`. NEVER the service role key.
   *Test:* the site loads on the public Vercel URL.
4. CORS = the Vercel URL. *Test:* the site calls Railway with no browser errors.
5. Pipe test with Daylen + Jordan. *Test:* a row written by Railway shows up live on the site.
6. $10-20 paid AI quota on the /attack provider; check Railway credit; share keys only in private
   chat; give Daylen backup access to everything.

**Build**
7. Branch `p1-firewall` off main. *Test:* pulls clean, app runs locally.
8. `policies.yaml` loads (finance_agent: read_email, read_file, send_email only to `@cisco.example`;
   `requires_approval_at_level: high`). *Test:* loads with no errors.
9. Victim agent tool loop (read_email, read_file, send_email -> fake outbox table, never real email),
   NO memory between tasks. *Test:* "Summarize my inbox" works.
10. Firewall wraps every tool call: policy check (least privilege) + scoped permissions per request.
    *Test:* a read-only task cannot send email.
11. `engine.record_event()` on every decision with actor, target, source, mitre (from `schemas.mitre`
    only), risk, plain-English reason. *Test:* events appear in Supabase.
12. Block one basic injection end to end. *Test:* blocked with a plain-English reason. Open your first PR.
13. Taint tracking + domain allowlist. *Test:* with AI detectors OFF, the poisoned email still
    cannot make the agent email outside.
14. Vault code never enters the model's context + canary check on outputs AND tool arguments.
    *Test:* creative "reveal the code" attempts all fail (spaced digits, base64, riddles, translations).
15. DLP (SSNs, keys, card numbers; for /attack also salaries, account numbers, personal data) +
    strip links/images to non-allowlisted domains. *Test:* salaries, SSNs and `evil.example` links
    are removed from replies.
16. Wire Miles's `scan_injection`; on error block (fail closed). *Test:* forcing a scanner error
    results in a block, not an allow.
17. Auto-hold suspicious actions as "Awaiting Approval" via Daylen's engine; check `entity_state`
    (frozen agent / locked actor = block). Never lock accounts yourself. *Test:* a frozen agent cannot act.
18. Firewall scoring: leak or canary hit = 100; blocked hijack with nothing leaked about 55.
    *Test:* those scores come out.
19. Unprotected mode. *Test:* the same attack "leaks" into the fake outbox when protection is off.
20. `POST /attack`: real layers, MITRE technique (AML.T0051.000 direct, AML.T0051.001 email,
    AML.T0054 jailbreak, AML.T0068 obfuscated), breach flag (canary, non-cisco.example email, or
    payroll/personal data shown to an outsider), actor = `judge:<nickname>`, source = audience,
    guest01..guest30 only, slowapi per-device + global cap ("The defenders are busy, retry in 5s"),
    500 char cap, honest offline state (never a fake block). Writes to `attempts`.
    *Test:* attack from a phone and get a correct result.
21. AI Analyst: incident summary + triage label ("Likely true positive, 94%"), cites event IDs +
    MITRE IDs, read-only tools (`query_events`, `get_incident`, `get_entity_history`,
    `propose_response` = creates a pending approval only), runs through your firewall, deterministic
    mock under DEMO_MODE. *Test:* a summary appears on the incident.
22. Measure added latency per action. *Test:* number available for the scoreboard/benchmark.
23. AI calls work from Railway on paid quota. *Test:* 30 quick requests, then the "defenders are
    busy" message appears cleanly.
24. Pre-demo checklist (PLAN.md section 17): Reset demo, DEMO_MODE plan, QR points at live
    `/attack` and tested on iPhone + Android, approver phone ready.

**Should-have:** analyst chat Q&A (`POST /analyst/ask`), `check_intent` wiring.

## Done means
- A poisoned email cannot leak anything or email outside cisco.example, even with AI detectors off.
- Every decision shows a plain-English reason.
- The analyst explains incidents with citations but can't change anything.

## Outstanding repo admin (yours)
Protect main (PR + passing CI, block force pushes and deletion), delete old branches (dev/miles,
dev/daylen, dev/jlee, scaffold/kairos, docs/claude-context), auto-delete head branches on merge.
