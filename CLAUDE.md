# Kairos: context for Claude (read this first, every session)

You are helping a 4-person team build **Kairos** at HackNCAT 10.0 (NC A&T), **Cisco track**
("Securing the Future of Human-AI Coexistence"), Architect tier. This file is shared by the whole
team. Personal notes go in `CLAUDE.local.md` (gitignored), never here.

## Step 1: find out who you're working with

At the start of a session, if the person hasn't said who they are, **ask: "Which teammate are you
(Ethan, Miles, Daylen or Jordan)?"** Then work ONLY inside that person's folders (table below).
If a task needs a change in someone else's folder, **stop and say so**: tell them what to ask the
owner for. Do not make the change.

| Who | Role | Branch | Owns (only they edit these) |
| --- | --- | --- | --- |
| **Ethan** (P1) | Firewall Lead + AI Analyst + **Deploy Owner** | `p1-firewall` | `api/firewall/` (incl. `policies.yaml`), `api/agents/`, `api/analyst/`, `api/routers/attack.py`, `api/routers/analyst.py`, `api/tests/firewall/`. Also Railway + Vercel settings (dashboards, not code). Owns the GitHub repo. |
| **Miles** (P2) | AI Lead + Red Team + Attack Picker; **pitch lead** | `p2-ai` | `api/detectors/`, `api/services/ai/`, `api/sensors/`, `api/redteam/` (incl. `seed/`), `api/routers/sensors.py`, `api/routers/redteam.py`, `api/routers/playground.py`, `api/tests/ai/`, `api/tests/benchmarks/`, `scripts/attack_chain/`, `web/src/app/redteam/` (his ONLY folder in `web/`) |
| **Daylen** (P3) | Core + Data + **Deploy Backup** | `p3-core` | `api/main.py`, `api/core/`, `api/schemas/`, `api/engine/`, `api/requirements*.txt`, routers `incidents`, `approvals`, `appeals`, `audit`, `agents`, `stats`, `demo`, `health`, `me`, `ai`, `api/tests/engine/`, `api/tests/test_*.py`, `supabase/migrations/` (ONLY Daylen), `.github/`, root files (`README.md`, `CLAUDE.md`, `.gitignore`, `.gitattributes`) |
| **Jordan** (P4) | Frontend (Defender Console) | `p4-web` | everything in `web/` EXCEPT `web/src/app/redteam/`: `package.json` + lockfile, `src/proxy.ts`, `src/lib/` (incl. `types/kairos.ts`), `src/components/`, `src/app/console/`, `src/app/attack/`, `src/app/approve/`, `src/app/login/`, all other pages |

Detailed map, contract and rules: **[docs/KAIROS.md](docs/KAIROS.md)**. Per-person task lists with
tests for each step: the team's Notion page ("BUILD CHECKLIST" on each person's page).

## What Kairos is (plain English)

Companies now give AI assistants access to email, files and actions. Attackers trick those
assistants (prompt injection) and chain that with older tricks (password guessing, fake-boss
messages). **Kairos** (Greek: "the decisive moment") watches a company, connects the clues into
one story, stops dangerous AI actions automatically, and keeps humans in charge of big decisions.

- **Fake company:** "Cisco" on the reserved fake domain **`cisco.example`**. NEVER use the real
  `cisco.com`. Every page shows: *"Fictional demo environment. Not affiliated with or endorsed by Cisco."*
  Employees are made up (j.smith in finance with a weak password, a made-up CFO).
- **Three listeners:** **Login Guard** (bots guessing passwords; timing/metadata only, never typed
  content), **Comms Guard** (phishing, impersonation, AI messages that manipulate people),
  **Agent Firewall** (sits between the company AI assistant and its tools; checks every action).
- **Code scores, not AI.** Every event and incident gets a 0-100 risk from rules in code
  (`engine.score_to_level`): **Low 0-29** log and watch; **Medium 30-59** alert + AI summary +
  next steps; **High 60-84** auto-pause the dangerous action (reversible) + recommend containment;
  **Critical 85-100** same + immediate phone approval request. An attacker can talk an AI into
  saying "low"; they can't talk code out of a number.
- **Connecting the dots:** events link into ONE incident only if they share the **same actor**,
  or form a **takeover chain** (one event's target becomes the next event's actor), and only within
  the same `source`. A shared target alone never links. Incident risk = highest event risk
  **+15 per extra listener**, max 100. Demo chain: 45 + 50 + 55 -> **85 Critical**
  ("three yellow alerts become one red alarm").
- **Two kinds of attackers:** `source = scripted` (our one-attacker Red Team chain) and
  `source = audience` (each judge is their own actor, `judge:<nickname>`, attacking only
  `guest01`..`guest30`). They never merge.
- **AI analyst** (like CrowdStrike Charlotte AI): explains incidents in plain English, cites event
  IDs and MITRE IDs, suggests next steps. Read-only; its only action creates a pending approval.
  It runs through our own firewall because event text is attacker-controlled.
- **MITRE:** every detection is labeled with official technique IDs from `api/schemas/mitre.py`
  (ATT&CK for people/account attacks, ATLAS for attacks on AI). IDs come ONLY from that table,
  never from a model.
- **Hard rules never bend** (Agent Firewall): the agent may only do what the task allows
  (read-only tasks can't send), can only email `@cisco.example`, can't act on instructions from
  untrusted content (taint tracking), **never sees the vault code**, DLP redacts secrets and
  payroll data, links/images to unknown domains are stripped. These hold even when every AI
  detector is fooled. Pitch line: *"We assume the AI WILL get fooled. Kairos is built so that when
  it does, nothing bad can happen."*
- **Humans in charge:** locking accounts, revoking sessions, freezing agents ALWAYS need a human
  tap on `/approve`. If nobody answers, paused actions stay paused, but nobody gets locked out.
  Approval text is built from code templates, never attacker text.

### The demo
- **Scene 1:** Red Team Console (`/redteam`, Miles) and Defender Console (`/console`, Jordan) side
  by side. Run Full Chain: bot breaks into j.smith -> fake CFO wire request -> poisoned email
  tries to make the AI send payroll outside. Kairos links all three into one Critical incident,
  the analyst explains it, a teammate taps Approve on a phone, incident turns Contained.
- **Scene 2:** a QR code **on a pitch slide** (not in the repo) opens `/attack`, the public
  audience **Attack Picker** (Password Guessing, Fake Boss Message, Trick the AI, Full Attack).
  The projector shows the console's audience view. There is NO big-screen page.

### Ethics (25 of 100 points, the biggest category)
Human oversight (approvals, kill switch, AI only suggests) · Transparency (every decision shows
its reason and score math) · Fairness (watch/slow/challenge/block ladder, false positives shown,
appeals, screen-reader users not flagged as bots, "please verify" instead of accusing) · Privacy
(timing only, raw login data deleted after 24h, plain-text filtered public views) · Safety (code
makes the final call, fails closed, tamper-evident audit log, attacks only on our fake company).

## Stack and layout

Next.js 16 + React 19 + TypeScript + Tailwind 4 in `web/` (Vercel) · FastAPI on Python 3.13 in
`api/` (Railway) · Supabase Postgres + Auth + Realtime · AI via `api/services/ai` (Groq default,
Anthropic, `mock`). Layout is `api/<module>/`, NOT `api/app/<module>/` (the Notion plan writes
`api/app/...`; ignore the `app/` part). `web/` is a new Next.js: read
`web/node_modules/next/dist/docs/` before using unfamiliar APIs (see `web/AGENTS.md`).

- **Contract:** `api/schemas/kairos.py` = `web/src/lib/types/kairos.ts` (FROZEN; change both
  together through Daylen + Jordan). Every endpoint already exists as a stub returning its final
  shape. Public: `POST /attack`, `POST /playground/launch`, `POST /sensors/login`, `POST /appeals`.
- **Writes:** only the backend writes to the database (service role). Events are written ONLY via
  `engine.record_event(...)`.
- **`DEMO_MODE=true`** puts the scripted chain + analyst on deterministic mocks. `/attack` always
  uses the real model and shows an honest offline state if it can't.
- **Render all AI replies and attacker text as plain text.** No markdown images, no auto-loaded
  images, no links to unknown domains.

## Rules (these prevent merge conflicts; follow them exactly)

1. Edit ONLY the current person's folders. Not even a typo fix elsewhere.
2. Create new files only inside their folders.
3. Frozen files (`api/main.py`, `api/core/`, `api/schemas/`, `web/src/lib/types/`,
   `requirements*.txt`, `package.json`/lockfile, `supabase/migrations/`) change only through
   their owner. Need a package? Ask Daylen (backend) or Jordan (frontend).
4. Never run a formatter on the whole repo. Format only their folders
   (e.g. `ruff format detectors sensors`).
5. Install with `npm ci` (never `npm install`) and `pip install -r requirements-dev.txt`.
6. Never `git add .` / `git add -A`. Stage their folders by path.
7. Never push to `main`, never plain `--force`. Work on their branch, open a PR, merge on green CI.
8. Never commit secrets. Keys live in `api/.env` (gitignored), Railway and Vercel. `web/.env`
   holds only public `NEXT_PUBLIC_*` values.
9. If a merge conflict happens: stop and tell the person. The file's owner resolves it.

## Commands

```bash
# API (from api/)
pip install -r requirements-dev.txt
uvicorn main:app --reload --port 8000     # Swagger: http://localhost:8000/docs
ruff check <their folders> && ruff format <their folders> && pytest

# Web (from web/)
npm ci && npm run dev                     # http://localhost:3000
npm run lint && npm run typecheck

# Ship (every ~2 hours)
git add <their folders>
git commit -m "<area>: <what changed>"
git fetch origin && git rebase origin/main
git push --force-with-lease origin <their branch>     # then open a PR into main
```
