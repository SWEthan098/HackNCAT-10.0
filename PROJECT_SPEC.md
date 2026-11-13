# PROJECT_SPEC

The technical source of truth for this repository. Update it in the same pull request as any change
it describes. When the challenge arrives, add a **Challenge specification** section at the top (see
[HACKATHON_WORKFLOW.md](HACKATHON_WORKFLOW.md) step 7); everything below stays true until changed.

Status: starter platform, no challenge-specific features yet. Last verified 2026-11-13.

## 1. What exists today

| Feature | Where | Verified by |
| --- | --- | --- |
| Sign-up with email, password, confirmation; duplicate detection | `web/src/app/signup` | E2E |
| Login, password visibility toggle, wrong-password message, `?next=` return | `web/src/app/login` | E2E |
| Session persisted in cookies; survives reload and a new browser context | `@supabase/ssr`, `src/proxy.ts` | E2E |
| Server-side route protection and guest-only pages | `src/proxy.ts`, `src/lib/routes.ts` | E2E, unit |
| Logout with confirmation (full navigation clears cached pages) | `components/layout/AppShell.tsx`, `AuthProvider` | E2E |
| Password recovery: request, PKCE link, token-hash link, implicit (dashboard-sent) link, set new password | `forgot-password`, `auth/callback`, `AuthHashHandler`, `reset-password` | E2E |
| Profile per user, created on sign-up, editable display name | `profiles` table, `GET /me`, `PATCH /me/profile` | E2E, pytest |
| Dashboard with navigation cards to working routes | `web/src/app/dashboard` | E2E |
| System status page (API, DB, session, AI) | `dashboard/system` | E2E |
| AI playground calling the backend AI service | `dashboard/ai`, `POST /ai/chat` | pytest (mock); live provider needs a key |

## 2. Repository layout and conventions

See the tree in [README.md](README.md#architecture). Conventions:

- **Frontend**
  - Import with the `@/` alias (`@/components/ui`, `@/lib/...`).
  - UI comes from `web/src/components/ui` only. A new pattern becomes a component there, not inline
    classes copied between pages.
  - Colours, fonts, radii and shadows come from tokens (`web/src/app/tokens.css`) through Tailwind
    utilities such as `bg-paper`, `text-ink`, `border-rule`, `text-accent`. No literal colours.
  - Every data region renders loading, empty, error and full states (`LoadingState`,
    `EmptyState`, `ErrorState`, `DataTable`).
  - Pages that read the session are client components under `/dashboard` (wrapped by
    `AuthProvider`) or are guarded by `src/proxy.ts`. Read the bundled Next 16 docs in
    `web/node_modules/next/dist/docs/` before using new framework APIs: this version differs from
    older Next.js (e.g. `middleware.ts` is now `proxy.ts`, Cache Components is on).
  - Routes are declared once in `web/src/lib/routes.ts`; add protected prefixes there.
- **Backend**
  - One router per feature in `api/routers/`, schemas in `api/schemas/`, logic in `api/services/`.
  - Raise `core.errors.AppError(status, code, message)` for expected failures. Every error response
    is `{"error": {"code", "message", "request_id"}}`.
  - Get the user with `Depends(current_user)`; get the DB with `Depends(get_db)`. Queries made with
    the service-role client **must** be filtered by `user.id`.
  - Configuration only through `core.config.get_settings()`. Never log secrets, tokens or prompts.
- **Database**: snake_case, plural table names, `id uuid` primary keys, `created_at`/`updated_at`
  `timestamptz`, RLS enabled on every table in the same migration that creates it.
- **Tests**: every new endpoint gets pytest coverage; every new user flow gets an E2E test.
- **Git**: see [docs/GITHUB.md](docs/GITHUB.md).

## 3. Authentication architecture

Details and Supabase settings: [docs/AUTH.md](docs/AUTH.md).

1. The browser signs in with Supabase Auth (`signInWithPassword` / `signUp`). `@supabase/ssr` stores
   the session in cookies.
2. On every request `src/proxy.ts` calls `supabase.auth.getClaims()`. That refreshes an expired
   access token with the refresh cookie and verifies the JWT signature against the project's JWKS.
   Unauthenticated requests to `/dashboard/*` or `/reset-password` get a redirect to
   `/login?next=…`; signed-in requests to `/login`, `/signup` or `/forgot-password` get a redirect to
   `/dashboard`.
3. `AuthProvider` (client) validates the user with `getUser()`, listens for `SIGNED_OUT` (including
   from other tabs) and exposes `api()`, which calls FastAPI with `Authorization: Bearer <access
   token>`, refreshing and retrying once on 401.
4. FastAPI `auth.current_user` verifies the token: ES256/RS256 against
   `SUPABASE_URL/auth/v1/.well-known/jwks.json` (this project uses ES256), or HS256 with
   `SUPABASE_JWT_SECRET` for legacy projects. It checks audience `authenticated` and expiry.
5. Supabase project settings in use: email provider on, **email confirmation off** (users can log in
   right after sign-up), sign-ups enabled.

Authorization is never decided in the browser: the proxy, RLS and the API each enforce it on the
server side.

## 4. Database

Migrations in `supabase/migrations/`, applied in filename order:

| Migration | Contents | Applied to the hosted project? |
| --- | --- | --- |
| `20261112000000_create_profiles.sql` | `profiles` table, RLS (select/update own row), `handle_new_user` trigger | Yes (table and trigger observed working) |
| `20261113000000_profiles_hardening.sql` | idempotent trigger (`on conflict do nothing`), backfill of missing profiles, `set_updated_at()` trigger, length/https constraints, least-privilege grants | **Not yet**: needs a manual run (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#supabase)) |

`public.profiles`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | references `auth.users(id)` on delete cascade: one profile per user, no duplicates |
| `display_name` | text | at most 80 chars (API validation; DB constraint after migration 2) |
| `avatar_url` | text | https only (API validation; DB constraint after migration 2) |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | set by the API on update; by trigger after migration 2 |

Profile creation is idempotent at three levels: the signup trigger, the backfill in migration 2,
and `GET /me`, which upserts with `on_conflict=id, ignore_duplicates` if a row is somehow missing.

No other tables exist. Do not add tables until the challenge requires them.

## 5. API

Swagger UI at `/docs` when `ENVIRONMENT` is not `production` (or `ENABLE_DOCS=true`).

| Method | Path | Auth | Purpose | Errors |
| --- | --- | --- | --- | --- |
| GET | `/health` | none | liveness | |
| GET | `/health/ready` | none | config presence flags + DB query | 503 `degraded` |
| GET | `/me` | bearer | verified identity + own profile (created if missing) | 401 |
| PATCH | `/me/profile` | bearer | update own `display_name` / `avatar_url` (unknown fields rejected) | 401, 422 |
| GET | `/ai/status` | bearer | active provider/model, key present (never the key) | 401 |
| POST | `/ai/chat` | bearer | `{messages[], system?, max_output_tokens?}` -> text, usage, latency, cost | 401, 422, 429, 502, 503, 504 |

Error codes include `unauthorized`, `validation_error`, `not_found`, `ai_not_configured`,
`ai_rate_limited`, `ai_timeout`, `ai_upstream_error`, `ai_refused`, `internal_error`. CORS allows
only `ALLOWED_ORIGINS`, with the bearer header and no cookies.

## 6. AI architecture

Details: [docs/AI.md](docs/AI.md). `api/services/ai/`:

- `base.py`: provider-neutral `ChatMessage`, `AIRequest`, `AIResponse`, `Usage`, `AIProviderError`,
  `AIProvider` interface.
- `groq_provider.py` (official `groq` SDK), `anthropic_provider.py` (official `anthropic` SDK,
  Claude Opus 5.5 by default, server-side refusal fallback on), `mock_provider.py` (offline).
- `ai_service.py`: picks the provider from `AI_PROVIDER`, resolves the model (`AI_MODEL` or the
  provider default), measures latency, estimates cost (`pricing.py`), logs usage without content.
- Timeouts (`AI_TIMEOUT_SECONDS`) and retries with backoff (`AI_MAX_RETRIES`, on 408/409/429/5xx)
  are handled by each SDK.

Features call `get_ai_service().chat(...)` or depend on `get_ai_service` in a route; they never
import a provider SDK.

## 7. Integrations

| Integration | What it is here | Doc |
| --- | --- | --- |
| Hallmark (Nutlope/hallmark, MIT) | Claude Code design skill installed at `~/.claude/skills/hallmark`; its scaffold generated our tokens/base CSS, and its linter (`sloplint`) checks `web/src` | [docs/HALLMARK.md](docs/HALLMARK.md) |
| Agent-Reach (Panniantong/Agent-Reach, MIT) | Claude Code research skill + `agent-reach` CLI on each developer machine; not an app dependency | [docs/AGENT_REACH.md](docs/AGENT_REACH.md) |
| GitHub Actions | `.github/workflows/ci.yml` | [docs/GITHUB.md](docs/GITHUB.md) |

## 8. Environments

| | Local | Production |
| --- | --- | --- |
| Web | `npm run dev` on :3000, `web/.env` (+ optional `web/.env.local`) | Vercel, env vars in project settings |
| API | `uvicorn --reload` on :8000, `api/.env`, `ENVIRONMENT=development`, Swagger on | Railway, `ENVIRONMENT=production`, Swagger off |
| Supabase | the single hosted project (no local Supabase) | same project |

All variables are documented in [.env.example](.env.example).

## 9. Known limitations

- Supabase's built-in email sender only delivers to project team members and has a low hourly
  limit. Add custom SMTP before real users reset passwords.
- PKCE recovery links (requested from the app) must be opened in the same browser. Switching the
  Supabase "Reset password" email template to the token-hash link removes that limit
  ([docs/AUTH.md](docs/AUTH.md#email-templates)).
- Migration 2 has to be applied by hand (no database credentials are stored in this repository).
