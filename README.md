# HackNCAT 10.0

A competition-ready starter for HackNCAT 10.0. Accounts, a secure API, a swappable AI layer, a
design system, tests and CI are already wired together, so the team can start on the Lenovo,
Cisco or Medtronic challenge the moment it is announced.

> The product itself is not built yet. When the challenge arrives, follow
> [HACKATHON_WORKFLOW.md](HACKATHON_WORKFLOW.md). The technical source of truth is
> [PROJECT_SPEC.md](PROJECT_SPEC.md).

## Tech stack

| Layer | Choice | Hosted on |
| --- | --- | --- |
| Frontend | Next.js 16 (App Router, Cache Components, Turbopack), React 19, TypeScript, Tailwind CSS 4 | Vercel |
| UI system | Own components in `web/src/components/ui`, built to the [Hallmark](docs/HALLMARK.md) design skill (Cobalt theme) | |
| Auth | Supabase Auth with `@supabase/ssr` cookie sessions, server-side route protection in `src/proxy.ts` | Supabase |
| Database | Supabase Postgres with Row Level Security, versioned SQL migrations | Supabase |
| Backend | FastAPI (Python 3.13), feature routers, central errors, JWT verification via JWKS | Railway |
| AI | Provider-neutral service: Groq (default), Anthropic Claude, offline mock | |
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
  src/components/ui/            design system (Button, Field, NavCard, Modal, Dropdown, Table, ...)
  src/components/auth/          AuthProvider (session state + authenticated API client)
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
```

## Local development

Prerequisites: Node 20+ (24 used in CI), Python 3.11+ (3.13 used in CI), access to the team's
Supabase project.

**1. API secrets.** The web app's public Supabase values are committed in `web/.env`. Only the API needs
secrets:

```bash
cp .env.example api/.env
# then set SUPABASE_SERVICE_ROLE_KEY (ask a teammate privately; never commit it)
# optional: GROQ_API_KEY / ANTHROPIC_API_KEY, or AI_PROVIDER=mock to work offline
```

**2. API** on http://localhost:8000 (Swagger at http://localhost:8000/docs):

```bash
cd api
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn main:app --reload --port 8000
```

**3. Web** on http://localhost:3000:

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000, create an account, and go to **System status** on the dashboard: every
row should say Pass (the AI row says "Not configured" until a key is set).

## Testing

| What | Command | Needs |
| --- | --- | --- |
| API lint + format | `cd api && ruff check . && ruff format --check .` | |
| API tests (31) | `cd api && pytest` | nothing (fake DB, local tokens, mock AI) |
| Web lint | `cd web && npm run lint` | |
| Web types | `cd web && npm run typecheck` | |
| Web production build | `cd web && npm run build` | |
| Web unit tests | `cd web && npm run test:unit` | |
| Browser E2E (14) | `cd web && npm run test:e2e` | both dev servers running, `api/.env` with the service role key, Microsoft Edge locally (or `PW_CHANNEL=chrome`) |

The E2E suite creates one uniquely named `e2e-…@example.com` user, runs the whole account lifecycle
(sign-up, duplicate sign-up, login, refresh, new browser context, profile, logout, wrong password,
open-redirect check, password recovery) and deletes that user, and only that user, at the end.

## Deployment

Vercel (web, root `web/`), Railway (API, root `api/`, config in `api/railway.json`) and Supabase.
Step-by-step settings, environment variables and the Supabase redirect URLs are in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## More docs

- [PROJECT_SPEC.md](PROJECT_SPEC.md): architecture, conventions, database, API, auth, AI
- [HACKATHON_WORKFLOW.md](HACKATHON_WORKFLOW.md): from challenge prompt to shipped demo
- [docs/AUTH.md](docs/AUTH.md) · [docs/AI.md](docs/AI.md) · [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) ·
  [docs/GITHUB.md](docs/GITHUB.md) · [docs/HALLMARK.md](docs/HALLMARK.md) · [docs/AGENT_REACH.md](docs/AGENT_REACH.md)
