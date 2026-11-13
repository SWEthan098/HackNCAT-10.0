# Team

Four people, one repo. Roles say who **owns** an area (decides, reviews, unblocks), not who is
allowed to touch it: anyone can pick up any issue. Re-balance once the challenge is known.

| Member | GitHub | Role | Owns | Branch |
| --- | --- | --- | --- | --- |
| Repo owner | @SWEthan098 | Lead, integration and pitch | `PROJECT_SPEC.md`, merges to `main`, deployment, demo script | `main` (merges), `feature/*` |
| Miles | `@<github-username>` | Frontend and UX | `web/` pages and `web/src/components/ui`, Hallmark design work, browser E2E tests | `dev/miles` |
| Daylen | `@<github-username>` | Backend and data | `api/` routers/schemas/services, Supabase migrations and RLS, API tests | `dev/daylen` |
| JLee | `@<github-username>` | AI and research | `api/services/ai`, prompts and model choice, `challenge/RESEARCH.md` with Agent-Reach | `dev/jlee` |

Fill in the GitHub usernames once everyone has accepted the collaborator invite.

## Responsibilities

**Lead, integration and pitch (repo owner)**
- Captures the original prompt in `challenge/ORIGINAL_PROMPT.md` and runs the analysis
  ([HACKATHON_WORKFLOW.md](HACKATHON_WORKFLOW.md) steps 1, 3, 4).
- Writes the challenge section of `PROJECT_SPEC.md` and its acceptance criteria; creates the
  GitHub issues and milestones.
- Reviews and merges pull requests into `main`; keeps CI green.
- Owns Vercel, Railway and Supabase settings and secrets ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
- Builds the slides and demo script; runs the rehearsals.

**Frontend and UX (Miles)**
- New screens under `web/src/app/dashboard/<feature>` with components from `@/components/ui`.
- Uses the Hallmark skill for any new design (`/hallmark ...`) and keeps
  `sloplint` clean ([docs/HALLMARK.md](docs/HALLMARK.md)).
- Loading, empty, error and full states for every data view; mobile layout.
- Adds an E2E test for each new user flow (`web/tests/e2e`).

**Backend and data (Daylen)**
- One router per feature in `api/routers/`, schemas in `api/schemas/`, logic in `api/services/`.
- New tables as migrations in `supabase/migrations/` with RLS in the same file; applies them in
  the Supabase SQL Editor and records it in `PROJECT_SPEC.md`.
- pytest coverage for every endpoint; keeps `ruff` clean.
- Integrations with sponsor APIs or datasets.

**AI and research (JLee)**
- Leads research with Agent-Reach and Claude Code; keeps `challenge/RESEARCH.md` labelled
  (Verified / Reported / Assumption) with sources ([docs/AGENT_REACH.md](docs/AGENT_REACH.md)).
- Chooses the model per AI feature (currently Groq `openai/gpt-oss-120b`; see [docs/AI.md](docs/AI.md)),
  writes and tests prompts, tracks token use and latency.
- Builds AI features on `services/ai` (structured output, RAG, tool calling) without importing a
  provider SDK in feature code.

## Working agreement

- **Branches.** Each person has a long-lived personal branch (`dev/<name>`) for exploration and
  small changes, and creates `feature/<issue>-<slug>` branches for issue work. Everything reaches
  `main` through a pull request with green CI and one review. Keep personal branches up to date:
  `git pull origin main` at least every few hours.
- **Pull requests.** Small (under ~400 lines), linked to an issue (`Closes #12`), with a short
  "how I tested it" note. Owners of the touched area review; the lead merges.
- **Secrets.** Never in Git, chat or screenshots. Each person keeps their own `api/.env`; the
  lead shares the Supabase secret key and the Groq key privately.
- **Supabase is shared.** There is one Supabase project for the whole team: a migration or a
  deleted user affects everyone. Announce schema changes before applying them. Test users go
  through the E2E suite, which creates and deletes its own `e2e-…@example.com` accounts.
- **Status.** Short check-in at the start of each block: what's done, what's next, what's blocked.

## Onboarding checklist (each teammate)

1. Accept the GitHub collaborator invite.
2. `git clone https://github.com/SWEthan098/HackNCAT-10.0.git` and `git checkout dev/<your-name>`.
3. Follow [README.md](README.md#local-development): `api/.env` from the lead, then run the API and
   the web app; create your account at http://localhost:3000/signup.
4. Open **System status** on the dashboard: every row should say Pass.
5. Install the Claude Code skills you'll use: Hallmark
   (`npx skills add nutlope/hallmark -g --agent claude-code`) and, for research, Agent-Reach
   ([docs/AGENT_REACH.md](docs/AGENT_REACH.md#installation)).
6. Add your GitHub username to the table above in your first pull request.
