# GitHub and version control

Remote: `https://github.com/SWEthan098/hackncat-10.0.git`. GitHub is the source of truth.

## Branches

- `main`: always deployable. Vercel and Railway deploy from it.
- `feature/<issue-number>-<short-slug>`: one branch per task, merged into `main` through a pull
  request after CI passes and a teammate (or `/code-review`) has reviewed it.
- No long-lived `develop` branch: with a team this size and a two-day clock, an extra integration
  branch adds merge work without catching more bugs. CI already runs on `develop` pushes if the team
  decides to add one.

Suggested `main` protection (Settings -> Branches): require a pull request, require the `Web` and
`API` checks, block force pushes.

## CI (`.github/workflows/ci.yml`)

| Job | Runs on | Steps |
| --- | --- | --- |
| Web | push to `main`, `develop`, `feature/**`; every PR | `npm ci`, ESLint, `tsc` (after `next typegen`), production build, Playwright unit tests |
| API | same | `pip install -r requirements-dev.txt`, `ruff check`, `ruff format --check`, `pytest` |
| E2E | manual (`workflow_dispatch` with `e2e: true`) | starts the API and the production web build, runs the browser suite against real Supabase |

No secrets are used by the Web and API jobs. The E2E job needs repository secrets `SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY`; GitHub masks them in logs. npm and pip caches are keyed on the
lockfile / requirements files.

## Hygiene

Ignored: `node_modules/`, `.next/`, `.venv/`, `__pycache__/`, `.env*` (except `.env.example` and the
deliberately public `web/.env`), test output, `.hallmark/`, `CLAUDE.md`. Lockfiles
(`web/package-lock.json`) are committed.

Before every commit: `git status`, read `git diff --staged`, and make sure no key-like string is
staged: `git diff --staged | grep -E "sb_secret_[A-Za-z0-9]|sk-ant-[a-z0-9]{6,}|gsk_[A-Za-z0-9]{10,}"` must not show
an actual key value (variable names and docs mentioning them are fine).
Never force-push to `main`.

History check 2026-11-13: no secret keys in any commit. Only `.env.example` and `web/.env` (public
URL and publishable key) were ever committed.

## Issues

Use the **Task** template (`.github/ISSUE_TEMPLATE/task.yml`): goal, acceptance criteria, linked
spec section, owner. Group by milestones (MVP, Polish, AI, Ship). See
[HACKATHON_WORKFLOW.md](../HACKATHON_WORKFLOW.md#8-github-tasks).
