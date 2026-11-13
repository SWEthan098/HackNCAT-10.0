# Hackathon workflow

From the moment the Lenovo, Cisco or Medtronic challenge is announced to the final demo. Templates
for each step live in [`challenge/`](challenge/).

## 1. Capture the original prompt (first 5 minutes)

- Paste the company's prompt, word for word, into `challenge/ORIGINAL_PROMPT.md`. Include the
  judging criteria, deliverables, deadlines and any rules or provided data/APIs.
- Do not paraphrase or trim it. Every later document links back to this file.
- Commit it immediately: `git commit -m "Add original challenge prompt"`.

## 2. Research (30 to 60 minutes, in parallel)

Split the questions between teammates. In Claude Code:

- Use the built-in web search and fetch for public pages first.
- Use **Agent-Reach** when that is not enough: GitHub repos and READMEs, YouTube talk transcripts,
  Reddit threads, pages the built-in fetch cannot read. Ask Claude naturally, for example
  *"Use agent-reach to read the transcripts of Cisco's last two DevNet keynotes about ThousandEyes"*
  or run `agent-reach read <url>` yourself. See [docs/AGENT_REACH.md](docs/AGENT_REACH.md).

Research targets: the company and its products, the industry problem, existing and competing
products, relevant public APIs and SDKs, available datasets, open-source libraries, technical docs,
and market evidence (who suffers from the problem and how much).

Record everything in `challenge/RESEARCH.md`. Every claim gets a source link and a label:
**Verified** (read in a primary source), **Reported** (secondary source) or **Assumption** (our
inference). Never present an assumption as a fact on a slide.

## 3. Challenge analysis

Fill in `challenge/ANALYSIS.md`: core problem, target users, business objective, required
deliverables, technical requirements, restrictions, judging criteria (with weights if given), and
how each criterion will be scored. Highlight anything **mandatory** from the prompt.

## 4. Product definition

In the same file: product name, problem statement, proposed solution, target users, the one core
user journey, primary features (must-have), differentiators (one or two), expected impact. Pick the
smallest product that wins on the judging criteria.

## 5. Technical specification

Map the product onto this starter:

- Frontend: new pages under `web/src/app/dashboard/<feature>`, a NavCard on `/dashboard`, a link in
  `NAV_ITEMS` (`AppShell.tsx`), components from `@/components/ui`.
- Backend: a router per feature in `api/routers/`, schemas, services; AI through
  `services/ai` (choose provider and model now, see [docs/AI.md](docs/AI.md#choosing-a-provider)).
- Database: new tables as migrations with RLS in the same file.
- External services, security needs, and what is deployed where.

## 6. Implementation roadmap

Order: (1) a working MVP of the core journey end to end, (2) core UX polish, (3) required
integrations, (4) AI features, (5) tests, (6) deployment, (7) demo script and slides. Break each into
tasks of half a day or less, each with an owner and a clear "done" check.

## 7. Update PROJECT_SPEC.md

Add a **Challenge specification** section at the top of [PROJECT_SPEC.md](PROJECT_SPEC.md) with the
product, architecture changes, new tables, new endpoints, and **measurable acceptance criteria**
(e.g. "a nurse can upload a CSV of 500 readings and see flagged anomalies in under 5 s"). This is the
contract the team builds against.

## 8. GitHub tasks

Create one issue per task with the **Task** issue template, attach it to a milestone per roadmap
phase (MVP, Polish, AI, Ship), assign an owner, and link it to the acceptance criterion it serves.
With the GitHub CLI: `gh issue create --template task.yml`. Work on `feature/<issue>-<slug>` branches
and open pull requests into `main` ([docs/GITHUB.md](docs/GITHUB.md)).

## 9. Build in small verified increments

- Keep `PROJECT_SPEC.md` open; do not drift from mandatory requirements.
- Using Claude Code well: give it the issue, the relevant spec section and the files to touch; ask
  it to write the test first; ask for `/code-review` before merging; tell it to use `/hallmark` for
  any new screen design; never paste secrets into the chat.
- Before every merge: `npm run lint && npm run typecheck && npm run build` in `web`,
  `ruff check . && pytest` in `api`, and the E2E suite for anything touching auth.
- Deploy early (Vercel preview per pull request), and deploy the demo build at least two hours before
  judging. Rehearse the demo on the deployed URL, not localhost.
