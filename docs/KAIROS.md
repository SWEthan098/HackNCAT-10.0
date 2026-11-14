# Kairos: team guide

Kairos (Cisco track) watches a fictional company ("Cisco" on the fake domain `cisco.example`) with
three listeners, scores every event 0-100 in code, connects related events into incidents, stops
dangerous AI actions automatically, and asks a human to approve anything disruptive.
Full plan: [PLAN.md](PLAN.md). Per-person checklists: [team/](team/). This file is the source of
truth for **who edits what**.
Using Claude Code? It auto-loads [CLAUDE.md](../CLAUDE.md); start by telling it who you are
("I'm Miles, P2").

## Who owns what (only the owner edits these)

```
kairos/ (repo root)
  .github/ (CI, CODEOWNERS), .gitattributes, .gitignore, README.md,
  CLAUDE.md, AGENTS.md                                               Daylen
  supabase/migrations/                                               Daylen (only Daylen)
  scripts/attack_chain/                                              Miles
  api/
    main.py            (FROZEN: every router already registered)     Daylen
    core/              (FROZEN)                                      Daylen
    schemas/           (FROZEN: kairos.py contract, mitre.py table)  Daylen
    requirements*.txt  (ask Daylen to add packages)                  Daylen
    engine/            (record_event, scoring, correlation)          Daylen
    agents/victim/     (the fake company's AI assistant)             Ethan
    firewall/          (incl. policies.yaml)                         Ethan
    analyst/           (AI security analyst)                         Ethan
    detectors/         (AI detectors, all return Detection)          Miles
    services/ai/       (provider layer: groq / anthropic / mock)     Miles
    sensors/           (Login Guard, Comms Guard)                    Miles
    redteam/           (attack runner + seed/ fake Cisco data)       Miles
    routers/
      attack.py, analyst.py                                          Ethan
      sensors.py, redteam.py, playground.py                          Miles
      incidents, approvals, appeals, audit, agents, stats, demo      Daylen
      health, me, ai (starter)                                       Daylen
    tests/
      firewall/                                                      Ethan
      ai/, benchmarks/                                               Miles
      engine/, test_kairos_stubs.py                                  Daylen
  web/
    package.json + package-lock.json (ask Jordan to add packages)    Jordan
    src/proxy.ts, src/lib/ (types/kairos.ts FROZEN), src/components/ Jordan
    src/app/console/   (Defender Console, incl. audience view)       Jordan
    src/app/attack/    (PUBLIC audience Attack Picker; QR lands here) Jordan
    src/app/approve/   (phone approvals)                              Jordan
    src/app/login/ and every other page                              Jordan
    src/app/redteam/   (Red Team Console: Miles's only web/ folder)   Miles
```

Notion's plan writes backend paths as `api/app/...`; in this repo they are `api/...` (no `app/`).
There is no big screen page: the QR code is a slide in the pitch deck.

## The API contract

Every endpoint exists now as a stub returning its final shape, so the frontend can build today.
Shapes: `api/schemas/kairos.py` (Python) = `web/src/lib/types/kairos.ts` (TypeScript).
Public (no login): `POST /attack`, `POST /playground/launch`, `POST /sensors/login`, `POST /appeals`.
Everything else needs `Authorization: Bearer <Supabase access token>`. Swagger: http://localhost:8000/docs

## Rules that keep us conflict-free

1. Only edit files in your own folders. Not even a typo fix elsewhere: ask the owner.
2. New files only inside your own folders.
3. Frozen files (`api/main.py`, `api/core/`, `api/schemas/`, `web/src/lib/types/`, dependency
   files, migrations) change only through their owner, in a small PR, then everyone rebases.
4. Never format the whole repo. Only format your own folders.
5. Install with `npm ci` (never `npm install`) and `pip install -r requirements-dev.txt`.
6. Never `git add .` or `git add -A`. Add your own folders by path.
7. Don't open and save other people's files (editors auto-format on save).
8. If a conflict happens anyway: stop. The owner of that file resolves it.

## Git routine

```bash
# once, after the scaffold is merged: FRESH clone (delete any old copy with local changes)
git clone https://github.com/SWEthan098/HackNCAT-10.0.git && cd HackNCAT-10.0
git checkout -b p2-ai            # p1-firewall (Ethan), p2-ai (Miles), p3-core (Daylen), p4-web (Jordan)

# every ~2 hours: ship
git add api/detectors api/sensors   # YOUR folders only
git commit -m "detectors: real injection scan"
git fetch origin && git rebase origin/main
git push --force-with-lease origin p2-ai
# open a PR into main; merge when CI is green

# whenever anyone else merges
git fetch origin && git rebase origin/main
```

Never `git push origin main`, never plain `--force`, never `git add .`.

## Database setup (Daylen)

Run the migrations in `supabase/migrations/` in filename order in the Supabase SQL Editor. Then:
Auth -> Sign In / Providers -> turn OFF "Allow new users to sign up"; create the team, approver and
red_team accounts by hand; add rows to `user_roles` (`approver`, `red_team`).
