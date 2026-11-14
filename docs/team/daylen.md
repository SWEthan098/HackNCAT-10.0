# Daylen (P3): Core + Data + Deploy Backup

**Branch:** `p3-core` · **Pair:** Ethan · Read `docs/PLAN.md` first (sections 6, 7, 9, 11, 13, 17).

**Mission:** the backbone and the brain: the shared foundation everyone builds on, scoring,
connecting events into incidents, human approvals, containment, and the audit log. Steps 1-4 block
everyone, so go fast. The AI analyst is Ethan's; do not build it.

## You own (ONLY you edit these)
```text
api/main.py               (frozen: every router already registered)
api/core/                 (frozen: config, auth, errors)
api/schemas/              (frozen: kairos.py contract, mitre.py table; change kairos.py only together with Jordan's TS mirror)
api/engine/               (record_event, scoring, correlation, approvals, audit, appeals, reset)
api/requirements*.txt     (others ask you to add packages)
api/routers/ incidents, approvals, appeals, audit, agents, stats, demo, health, me, ai
api/tests/engine/, api/tests/test_*.py
supabase/migrations/      (ONLY you)
.github/, root files (README.md, CLAUDE.md, .gitignore, .gitattributes), docs/
```

## Your endpoints
- `GET /incidents`, `GET /incidents/{id}` (with MITRE rolled up in kill-chain order)
- `POST /approvals/{id}/approve`, `POST /approvals/{id}/deny`
- `POST /killswitch`, `POST /agents/{id}/freeze`
- `GET /stats`, `GET /audit/verify`
- `POST /appeals` (public), `GET /appeals`
- `POST /demo/reset` (red_team only)
- Internal: `record_event()`, `score_to_level()`, `incident_risk()`, `create_approval()`, `reset_demo()`

## You depend on / you provide
- **You provide:** the contract, the database, `record_event()`, scoring, correlation, approvals,
  containment (`entity_state`), audit, stats, reset. Everyone builds on you.
- **From Ethan:** firewall events, `propose_response` approvals from the analyst.
- **From Miles:** listener events, seed data (reloaded by reset).

## Build checklist (in order; each step has a test)
1. Supabase: run `supabase/migrations/` in filename order in the SQL Editor
   (`20261114000000_kairos_core.sql` is the Kairos one); Realtime on events, incidents, approvals,
   public_feed, attempts; Auth -> turn OFF open sign-ups; create accounts by hand (4 teammates,
   approver, red_team); add `user_roles` rows. *Test:* approver can read approvals, a normal account can't.
2. Verify the MITRE IDs marked VERIFY in `api/schemas/mitre.py` (T1656 vs T1684.001; what replaced
   AML.T0057) on attack.mitre.org / atlas.mitre.org; AML.T0068 is present. Then it's frozen.
   *Test:* every ID checked.
3. Replace the `@TODO-*` handles in `.github/CODEOWNERS` with real GitHub usernames.
4. Give Ethan the Supabase URL + keys privately; join the pipe test. *Test:* a row shows up live on the website.
5. Branch `p3-core`. `engine.record_event()`: insert into events, write audit_log, run correlation.
   *Test:* rows land in events with all fields.
6. `score_to_level` already works (Low 0-29, Medium 30-59, High 60-84, Critical 85-100); keep
   thresholds in one place. *Test:* unit tests pass at the boundaries.
7. Correlation: open an incident when 2+ different listeners link; link only by same actor OR
   takeover chain (one event's target = next event's actor); same source only; never shared target
   alone. *Test:* scripted chain = ONE incident; two different judges stay SEPARATE.
8. `incident_risk` = highest event + 15 per extra listener, max 100 (demo = 85). Replace the stub
   incidents (`inc-demo`) with real ones from the DB; MITRE in kill-chain order. *Test:* Jordan can render them.
9. Approvals: verify JWT + approver role + still pending; text built from CODE TEMPLATES using event
   facts (who, what, which rule, score), never attacker text; High = recommend containment;
   Critical auto-creates an approval; timeout = held actions stay held, nothing gets locked.
   *Test:* approve and deny both work from a phone.
10. Approved disruptive actions write `entity_state` (lock account, revoke sessions, freeze agent).
    *Test:* after approval, re-running stage 1 fails with "account locked".
11. Kill switch + per-agent freeze. *Test:* kill switch stops every agent action.
12. Audit log hash chain + `GET /audit/verify`. *Test:* editing one row by hand makes verify fail.
13. `public_feed` sanitizer (filtered plain text, no personal data); 24h deletion of raw login data
    (keep scores). *Test:* old raw rows get deleted.
14. `reset_demo()` + `POST /demo/reset` (red_team only): clears entity_state, incidents, test data,
    then seed can be reloaded. *Test:* one click returns a clean demo state.
15. Appeals API (no screen) + `GET /stats`: attacks blocked, breaches (canary, non-cisco.example
    email, OR payroll/personal data shown to an outsider), false positives, avg decision time, open
    incidents per level. *Test:* KPI strip numbers match the data.

**Audience events:** `/playground/launch` and `/attack` events (source = audience, actor =
`judge:<nickname>`, guest accounts only) correlate per judge and never join the scripted incident.

## Deploy backup
You have Railway/Vercel access but only change settings if Ethan is unavailable. One person at a time.

## Done means
- Run Full Chain becomes one Critical incident (~85) with three linked events.
- Approve on a phone flips the incident to Contained live; re-running stage 1 fails with "account locked".
- Audit verify shows the chain intact.
