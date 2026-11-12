# hackncat

> TODO: one-line description of what we're building.

Monorepo starter: **Next.js** (Vercel) + **Supabase** (Auth, Postgres, Storage, Realtime) + **FastAPI** (Railway).

## Architecture

```
Browser -> Vercel (Next.js, web/) -> Supabase (Auth, DB, Storage, Realtime)
               |
               +-- Bearer JWT -> Railway (FastAPI, api/) -> Supabase (service role)
```

- **Auth:** Supabase Auth only. The browser signs in with Supabase and gets a JWT.
- **Simple CRUD:** the frontend queries Supabase directly. Row Level Security (RLS) protects every table.
- **Heavy or secret work** (AI calls, background jobs, third-party APIs) goes in FastAPI. The frontend sends
  `Authorization: Bearer <supabase access token>`. `api/auth.py` verifies it (HS256 via `SUPABASE_JWT_SECRET`,
  or ES256/RS256 via the project's JWKS endpoint if the project uses asymmetric signing keys).
  The API then talks to Supabase with the service role key.

```
web/                      Next.js (TypeScript, Tailwind, App Router)
  src/lib/supabase.ts     browser Supabase client
  src/app/login/          login / signup
  src/app/dashboard/      protected page; calls API /me
api/                      FastAPI
  main.py                 /health, /me, CORS
  auth.py                 current_user dependency (JWT verification)
supabase/migrations/      SQL schema, versioned in git
```

## Run locally

Prerequisites: Node 20+, Python 3.11+, a Supabase project (see Deploy step 1).

```bash
cp .env.example web/.env.local   # keep only the web section
cp .env.example api/.env         # keep only the api section
```

Fill in the values from your Supabase dashboard (Project Settings -> API Keys / JWT Keys).

**Terminal 1: API** (http://localhost:8000)

```bash
cd api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Terminal 2: web** (http://localhost:3000)

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000, sign up, then go to `/dashboard`. You should see your user id and profile returned
from the API's `/me`, which proves the full chain works: browser -> Supabase Auth -> FastAPI -> Supabase.

## Deploy

1. **Supabase**
   - Create a project.
   - Run the migrations: paste each file in `supabase/migrations/` into the SQL Editor in order, or use the CLI
     (`supabase link --project-ref <ref>` then `supabase db push`).
   - Auth -> URL Configuration: set Site URL to your Vercel URL and add `http://localhost:3000` to redirect URLs.
   - For faster hackathon testing you can disable "Confirm email" under Auth -> Providers -> Email.
2. **Vercel** (frontend)
   - Import the GitHub repo. Set **Root Directory = `web`**.
   - Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` (Railway URL).
3. **Railway** (API)
   - New service from the GitHub repo. Set **Root Directory = `api`**.
   - Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
     `ALLOWED_ORIGINS` (your Vercel URL(s), comma-separated).
   - Generate a public domain, then put it in Vercel's `NEXT_PUBLIC_API_URL` and redeploy the frontend.

## Team workflow

- `main` is always deployable. Never push directly to it.
- Branch per feature: `git checkout -b feat/<short-name>`.
- Open a PR into `main`. Vercel posts a preview deploy on every PR. Test there, get one review, merge.
- **One person per folder** to avoid merge conflicts, e.g. one on `web/` pages, one on `web/` components,
  one on `api/`, one on `supabase/migrations/`. Coordinate before touching someone else's area.
- Schema changes: add a **new** timestamped file in `supabase/migrations/`. Never edit a migration that has
  already been applied.
- Pull `main` often (`git pull --rebase origin main`) to keep conflicts small.
