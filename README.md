# HackNCAT 10.0: Kairos (Cisco track)

> **Team, start here: [docs/KAIROS.md](docs/KAIROS.md)** has who owns which folder, the API
> contract, the no-merge-conflict rules and the git routine. Kairos watches a fictional company
> ("Cisco" on `cisco.example`), connects attacks into incidents, stops dangerous AI actions, and
> keeps humans in charge. *Fictional demo environment. Not affiliated with or endorsed by Cisco.*


A competition-ready starter for HackNCAT 10.0. Accounts, a secure API, a working AI layer (Groq), a
design system, tests and CI are already wired together, so the team can start on the Lenovo, Cisco or
Medtronic challenge the moment it is announced.

> The product itself is not built yet. When the challenge arrives, follow
> [HACKATHON_WORKFLOW.md](HACKATHON_WORKFLOW.md). Technical source of truth:
> [PROJECT_SPEC.md](PROJECT_SPEC.md). Who owns what: [TEAM.md](TEAM.md).

Repository: https://github.com/SWEthan098/HackNCAT-10.0

## Status (2026-11-13)

| Area | State |
| --- | --- |
| Auth (sign-up, login, sessions, logout, password recovery) | Working, covered by browser E2E tests |
| Database (`profiles` + both migrations) | Applied to the hosted Supabase project and verified |
| API (FastAPI) | Working locally; 31 tests passing |
| AI | Groq connected and verified live (`openai/gpt-oss-120b`); Anthropic adapter ready, no key yet |
| CI (GitHub Actions) | Running on every push and pull request; Web and API jobs passing |
| Deployment (Vercel, Railway) | Not deployed yet; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |

## Tech stack

| Layer | Choice | Hosted on |
| --- | --- | --- |
| Frontend | Next.js 16 (App Router, Cache Components, Turbopack), React 19, TypeScript, Tailwind CSS 4 | Vercel |
| UI system | Own components in `web/src/components/ui`, built to the [Hallmark](docs/HALLMARK.md) design skill (Cobalt theme) | |
| Auth | Supabase Auth with `@supabase/ssr` cookie sessions, server-side route protection in `src/proxy.ts` | Supabase |
| Database | Supabase Postgres with Row Level Security, versioned SQL migrations | Supabase |
| Backend | FastAPI (Python 3.13), feature routers, central errors, JWT verification via JWKS | Railway |
| AI | Provider-neutral service: Groq (default, live), Anthropic Claude, offline mock | |
| Tests | pytest (API), Playwright (unit + browser E2E against real Supabase) | GitHub Actions |
| Research | [Agent-Reach](docs/AGENT_REACH.md) Claude Code skill | |

## Architecture

```
Browser ──> Next.js (web/, Vercel) ──> Supabase Auth + Postgres (RLS)
   │            └─ proxy.ts: refreshes the session cookie, guards routes
   │
   └─ Authorization: Bearer <Supabase access token>
                └──> FastAPI (api/, Railway) ──> Supabase (service role, scoped per user)
                                         └──> AI provider (Groq / Anthropic / mock)
```

- **Simple CRUD** can go straight from the browser to Supabase; RLS protects every table.
- **Secret or heavy work** (AI calls, third-party APIs, jobs) goes through FastAPI, which verifies the
  user's token and holds all server-side keys.

```
web/
  src/proxy.ts                  route protection + session refresh (Next 16 "proxy" = middleware)
  src/app/                      pages: / login signup forgot-password reset-password auth/callback dashboard/*
  src/app/tokens.css, base.css  Hallmark-generated design tokens and base rules
  src/components/ui/            design system (Button, Field, NavCard, Modal, Dropdown, Table, ...)
  src/components/auth/          AuthProvider, AuthHashHandler, form helpers
  src/lib/                      supabase clients, API client, routes, validation
  tests/unit, tests/e2e         Playwright tests
api/
  main.py                       app factory, middleware, routers
  auth.py                       Supabase JWT verification (ES256 via JWKS, or HS256)
  core/                         config, errors, request logging, database client
  routers/                      health, me, ai (one module per feature)
  schemas/                      Pydantic request/response models
  services/ai/                  provider abstraction: base, groq, anthropic, mock, ai_service
  tests/                        pytest (no network, no credentials)
supabase/migrations/            SQL schema, applied in filename order
challenge/                      templates for the challenge intake workflow
docs/                           AUTH, AI, DEPLOYMENT, GITHUB, HALLMARK, AGENT_REACH
.github/                        CI workflow, Task issue template
```

## Local development

Prerequisites: Node 20+ (24 in CI), Python 3.11+ (3.13 in CI), Git, and access to the team's
Supabase project.

**1. Clone and pick your branch** (see [TEAM.md](TEAM.md)):

```bash
git clone https://github.com/SWEthan098/HackNCAT-10.0.git
cd HackNCAT-10.0
git checkout -b p2-ai   # yours: p1-firewall (Ethan), p2-ai (Miles), p3-core (Daylen), p4-web (Jordan)
```

**2. API secrets.** The web app's public Supabase values are committed in `web/.env`. Only the API
needs secrets:

```bash
cp .env.example api/.env
# then set SUPABASE_SERVICE_ROLE_KEY and GROQ_API_KEY (get both from the lead privately; never commit them)
# no Groq key yet? set AI_PROVIDER=mock to work offline
```

**3. API** on http://localhost:8000 (Swagger at http://localhost:8000/docs):

```bash
cd api
python -m venv .venv
source .venv/bin/activate          # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn main:app --reload --port 8000
```

After editing `api/.env`, stop and restart uvicorn: `--reload` only watches Python files.

**4. Web** on http://localhost:3000:

```bash
cd web
npm ci          # never `npm install`: it rewrites the lockfile and causes conflicts
npm run dev
```

Open http://localhost:3000, create an account, and open **System status** on the dashboard. Every row
should say Pass, including the AI provider when the Groq key is set.

## Testing

| What | Command | Needs |
| --- | --- | --- |
| API lint + format | `cd api && ruff check . && ruff format --check .` | |
| API tests (58) | `cd api && pytest` | nothing (fake DB, local tokens, mock AI) |
| Web lint | `cd web && npm run lint` | |
| Web types | `cd web && npm run typecheck` | |
| Web production build | `cd web && npm run build` | |
| Web unit tests (8) | `cd web && npm run test:unit` | |
| Browser E2E (14) | `cd web && npm run test:e2e` | both dev servers running, `api/.env` with the service role key, Microsoft Edge (or `PW_CHANNEL=chrome` if you have Chrome) |

The E2E suite creates one uniquely named `e2e-…@example.com` user, runs the whole account lifecycle
(sign-up, duplicate sign-up, login, refresh, new browser context, profile, a real AI prompt, logout,
wrong password, open-redirect check, password recovery) and deletes that user, and only that user,
at the end. CI runs everything except E2E on every push; E2E can be started by hand from the Actions
tab ([docs/GITHUB.md](docs/GITHUB.md#ci)).

## Deployment

Vercel (web, root `web/`), Railway (API, root `api/`, config in `api/railway.json`) and Supabase.
Settings, environment variables and the Supabase redirect URLs: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## More docs

- [TEAM.md](TEAM.md): roles, branches, working agreement, onboarding
- [PROJECT_SPEC.md](PROJECT_SPEC.md): architecture, conventions, database, API, auth, AI
- [HACKATHON_WORKFLOW.md](HACKATHON_WORKFLOW.md): from challenge prompt to shipped demo
- [docs/AUTH.md](docs/AUTH.md), [docs/AI.md](docs/AI.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md),
  [docs/GITHUB.md](docs/GITHUB.md), [docs/HALLMARK.md](docs/HALLMARK.md), [docs/AGENT_REACH.md](docs/AGENT_REACH.md)
