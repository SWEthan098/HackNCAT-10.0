# Deployment

Nothing has been deployed from this repository yet. The production build and production start
commands were verified locally on 2026-11-13 (`next build` + `next start`; `uvicorn` with
`ENVIRONMENT=production`: `/health` 200, `/docs` 404, `/health/ready` 200, proxy redirects working).

Order: Supabase, then Railway (API), then Vercel (web), then come back to Railway for CORS and to
Supabase for redirect URLs.

## Supabase

1. **Apply migrations** in filename order. `20261112000000_create_profiles.sql` is already live.
   Apply `20261113000000_profiles_hardening.sql` (idempotent, safe to re-run):
   - Dashboard: SQL Editor -> paste the file -> Run, or
   - CLI: `npx supabase login`, `npx supabase link --project-ref lyzkuyaetnlbvmwudskk`,
     `npx supabase db push`.
2. **Auth -> URL Configuration**: Site URL = the Vercel production URL; Redirect URLs =
   `http://localhost:3000/**` and `https://<vercel-domain>/**` (see [AUTH.md](AUTH.md#redirect-urls)).
3. **Auth -> SMTP**: add a custom SMTP provider before real users need password reset emails.
4. Optional: the token-hash recovery template from [AUTH.md](AUTH.md#email-templates).

## Railway (API)

1. New service from the GitHub repo, **Root Directory = `api`**. `api/railway.json` sets the start
   command (`uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips=*`),
   the health check (`/health`) and restarts. Python version comes from `api/.python-version` (3.13).
2. Variables:

   | Variable | Value |
   | --- | --- |
   | `ENVIRONMENT` | `production` |
   | `SUPABASE_URL` | `https://lyzkuyaetnlbvmwudskk.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | the secret key (sealed variable) |
   | `ALLOWED_ORIGINS` | `https://<vercel-domain>` (comma-separate preview domains if needed) |
   | `AI_PROVIDER`, `AI_MODEL`, `GROQ_API_KEY` / `ANTHROPIC_API_KEY` | as chosen |
   | `ENABLE_DOCS` | `true` only if judges should see Swagger |

3. Generate a public domain and check `https://<railway-domain>/health/ready` shows
   `"database": "ok"`.

## Vercel (web)

1. Import the repo, **Root Directory = `web`**. Framework preset: Next.js (build `npm run build`).
2. Environment variables (Production and Preview):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | same as `web/.env` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as `web/.env` (publishable key) |
   | `NEXT_PUBLIC_API_URL` | `https://<railway-domain>` (no trailing slash) |

   `NEXT_PUBLIC_*` values are compiled into the bundle: redeploy after changing them.
3. Deploy, then add the Vercel domain to Railway `ALLOWED_ORIGINS` and to Supabase redirect URLs.

## Production checks

Run these against the deployed URLs before calling a deployment done:

1. `/` loads; `/dashboard` redirects to `/login?next=%2Fdashboard`.
2. Sign up a test user, land on `/dashboard`, reload, still signed in.
3. Dashboard -> System status: all Pass (AI "Not configured" is acceptable without a key).
4. Log out, log back in with the same credentials.
5. Forgot password -> email arrives (needs custom SMTP or a team member's address) -> link opens
   `/reset-password` -> new password works.
6. Delete the test user in Supabase -> Authentication -> Users.

You can point the E2E suite at a deployment: `E2E_BASE_URL=https://<vercel-domain> npm run test:e2e`
(the API URL is the one compiled into that deployment).

## Local vs production

| | Local | Production |
| --- | --- | --- |
| `ENVIRONMENT` | `development` (Swagger on) | `production` (Swagger off) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` (`web/.env`) | Railway URL (Vercel env) |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Vercel domain(s) |
| Secrets | `api/.env` (gitignored) | Railway variables |
