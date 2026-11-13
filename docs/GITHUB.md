# GitHub and version control

Repository: https://github.com/SWEthan098/HackNCAT-10.0 (private). GitHub is the source of truth.

The repository was renamed from `hackncat-10.0` to `HackNCAT-10.0`. Old clones still work because
GitHub redirects, but you can update yours with
`git remote set-url origin https://github.com/SWEthan098/HackNCAT-10.0.git`.

## Collaborators

The owner (@SWEthan098) invites teammates: repository -> Settings -> Collaborators -> Add people.
Collaborators on a personal repository get write access (push branches, open and merge pull
requests). Roles and ownership are in [TEAM.md](../TEAM.md).

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Always deployable. Vercel and Railway deploy from it. Changes arrive only through pull requests. |
| `dev/miles`, `dev/daylen`, `dev/jlee` | Each teammate's personal working branch, created from `main` on 2026-11-13. |
| `feature/<issue-number>-<slug>` | One branch per issue, from an up-to-date `main` (or your `dev/` branch). |

No long-lived shared `develop` branch: with four people and a two-day clock it adds merge work
without catching more bugs. CI also runs on `develop` pushes if the team adds one later.

Daily flow:

```bash
git checkout dev/<you>
git pull origin main                       # stay current; resolve conflicts early
git checkout -b feature/12-upload-readings # for issue #12
# ...commit...
git push -u origin feature/12-upload-readings
# open a pull request into main; CI runs; get one review; the lead merges
```

### Recommended `main` protection

Settings -> Branches -> Add rule for `main`:

- Require a pull request before merging (1 approval).
- Require status checks to pass: **Web (lint, types, build, unit tests)** and **API (lint, tests)**.
- Do not allow force pushes or deletions.

## CI

`.github/workflows/ci.yml`. First run on GitHub: 2026-11-13, Web and API jobs passed.

| Job | Runs on | Steps |
| --- | --- | --- |
| Web | push to `main`, `develop`, `dev/**`, `feature/**`; every pull request | `npm ci`, ESLint, `tsc` (after `next typegen`), production build, Playwright unit tests |
| API | same | `pip install -r requirements-dev.txt`, `ruff check`, `ruff format --check`, `pytest` |
| E2E | manual: Actions -> CI -> Run workflow -> tick "e2e" | starts the API and the production web build, runs the browser suite against real Supabase with `AI_PROVIDER=mock` |

The Web and API jobs use no secrets. The E2E job needs repository secrets `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` (Settings -> Secrets and variables -> Actions); GitHub masks them in logs.

### Pushing workflow files

Changing anything under `.github/workflows/` needs a GitHub credential with the `workflow` scope.
If a push is rejected with "refusing to allow an OAuth App to create or update workflow", sign in
again so Git Credential Manager requests a fresh token:

```bash
git credential-manager github logout <your-github-username>
git push            # a browser sign-in opens; approve it
```

## Hygiene

Ignored: `node_modules/`, `.next/`, `.venv/`, `__pycache__/`, `.env*` (except `.env.example` and the
deliberately public `web/.env`), test output, `.hallmark/`, `CLAUDE.md`. `web/package-lock.json` is
committed.

Before every commit, read `git diff --staged`. This must not show an actual key value (variable names
and docs that mention them are fine):

```bash
git diff --staged | grep -E "sb_secret_[A-Za-z0-9]|sk-ant-[a-z0-9]{6,}|gsk_[A-Za-z0-9]{10,}"
```

Never force-push to `main`. History check 2026-11-13: no secret keys in any commit; only
`.env.example` and `web/.env` (public URL and publishable key) were ever committed.

## Issues

Use the **Task** template (`.github/ISSUE_TEMPLATE/task.yml`): goal, acceptance criteria, area,
owner. Group by milestones (MVP, Polish, AI, Ship). See
[HACKATHON_WORKFLOW.md](../HACKATHON_WORKFLOW.md#8-github-tasks).
