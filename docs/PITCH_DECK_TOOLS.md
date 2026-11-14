# Pitch deck tools (research)

Question: which Claude / Claude Code skills, plugins or repos give us the strongest hackathon pitch
deck for Saturday 3pm (3 minutes + Q&A, Cisco track, "Securing the Future of Human-AI
Coexistence"), built tonight in Claude Code (VS Code) and presentable offline?

Researched 2026-11-14. All "Verified" claims were checked on 2026-11-14 at the linked primary
source (the repo's own README / SKILL.md / manifest, and GitHub's search API for stars, licence and
last push). Labels: **Verified** (primary source, linked), **Reported** (secondary source, linked),
**Assumption** (our judgement, not checked).

## Recommendation (short version)

| Rank | Pick | Why | Install (Claude Code) |
|------|------|-----|------------------------|
| **1** | [frontend-slides](https://github.com/zarazhangrui/frontend-slides) for the deck, **plus** the `hack-pitch` skill from [calhacks-kit](https://github.com/georgeykalangi/calhacks-kit) for the script and Q&A | Most-used, MIT, single-file HTML with PDF export; `hack-pitch` adds the hackathon timing, roles and judge-question prep the slide tools lack | `git clone https://github.com/zarazhangrui/frontend-slides.git ~/.claude/skills/frontend-slides` |
| 2 | calhacks-kit `hack-showtime` (deck) | Built for exactly this: demo-first hackathon deck, self-contained offline template, system fonts, overflow check, PDF via Chrome. Weakness: brand-new, 6 stars | `/plugin marketplace add georgeykalangi/calhacks-kit` then `/plugin install calhacks-kit@calhacks-kit` |
| 3 | Anthropic [`pptx` skill](https://github.com/anthropics/skills/tree/main/skills/pptx) | Only if we must hand in .pptx / Google Slides; native, editable PowerPoint charts for the benchmark slide | `/plugin marketplace add anthropics/skills` then `/plugin install document-skills@anthropic-agent-skills` |

Biggest single risk for pick 1: frontend-slides decks load fonts from Google Fonts / Fontshare
over the network (Verified, below). On bad venue Wi-Fi the deck falls back to other fonts and
layouts can shift. Fix tonight: ask Claude to use system fonts (or download the font files into the
deck folder), then test with Wi-Fi off, and keep the PDF as a backup.

## Method

- **GitHub**: `gh api search/repositories` with queries such as "pitch deck claude skill", "slides
  skill claude code", "hackathon pitch skill", "marp claude skill", "slidev skill", "pptx skill
  claude"; then repo metadata via `search/repositories?q=repo:...` (the per-repo `repos/` endpoint
  is not enabled in this session). READMEs, SKILL.md files, manifests and templates were read from
  `raw.githubusercontent.com`.
- **Official directories**: read `.claude-plugin/marketplace.json` of
  [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) (317
  plugins) and [anthropics/skills](https://github.com/anthropics/skills), filtering for slide /
  deck / presentation / pitch / pptx.
- **Web search** for community signal and leads (results treated as leads only).
- **Blocked (could not reach)**: `reddit.com` and `old.reddit.com` (proxy returns 403 to CONNECT;
  the web-search tool also refuses the reddit.com domain), `news.ycombinator.com` and
  `hn.algolia.com` (not in this session's allowed network), `skills.sh` (not allowed). So there is
  **no first-hand Reddit or HN reading** in this note. HN items below are titles from search
  results only. r/hackathon advice could not be checked at all; pitch-structure guidance below comes
  from skills' own primary files instead.
- Everything fetched was treated as data. No skill was installed or run here.

## Candidates

### 1. frontend-slides (zarazhangrui)

- URL: https://github.com/zarazhangrui/frontend-slides
- **Verified** ([README](https://github.com/zarazhangrui/frontend-slides/blob/main/README.md),
  [SKILL.md](https://github.com/zarazhangrui/frontend-slides/blob/main/SKILL.md)): a coding-agent
  skill, packaged as a Claude Code plugin, that builds HTML presentations from scratch or converts
  a .pptx. It asks about content, generates 3 visual style previews to pick from, then builds the
  deck and opens it in the browser. "Single HTML files with inline CSS/JS. No npm, no build tools."
  12 presets (including "Neon Cyber" and "Terminal Green", relevant for a security pitch) plus 34
  "bold" templates. Fixed 16:9.
- Output: single HTML file; PDF via `scripts/export-pdf.sh` (Playwright screenshots each slide at
  1920x1080, downloads Chromium ~150MB on first run, animations lost; `--compact` for smaller PDFs);
  optional Vercel deploy via `scripts/deploy.sh` (needs a free Vercel account). No PPTX output (it
  converts PPTX *in*). **Verified** (README "Export to PDF", SKILL.md 6B).
- Offline caveat, **Verified**: SKILL.md says "Use fonts from Fontshare or Google Fonts — never
  system fonts", and `html-template.md` links `https://api.fontshare.com/...`. The PDF export
  "starts a local server ... so Google Fonts and relative image paths work".
- Install, **Verified**: plugin route `/plugin marketplace add https://github.com/zarazhangrui/frontend-slides`
  then `/plugin install frontend-slides@frontend-slides` (as two separate messages; skill is then
  `/frontend-slides:frontend-slides`), or manual `git clone https://github.com/zarazhangrui/frontend-slides.git ~/.claude/skills/frontend-slides`
  (skill is `/frontend-slides`).
- Known install bugs: GitHub issues [#64](https://github.com/zarazhangrui/frontend-slides/issues/64)
  and [#73](https://github.com/zarazhangrui/frontend-slides/issues/73) ("Plugin install drops
  SKILL.md"), both closed (**Verified** via issue search). **Assumption**: the git-clone route avoids
  that class of problem, so prefer it tonight.
- License: MIT (**Verified**, README). Last push 2026-06-23; created 2026-01-28 (**Verified**, API).
  About 5 months without a push: not abandoned, not actively changing.
- Popularity: 32,312 stars, 2,465 forks, 71 open issues (**Verified**, API). Widely mirrored on
  skill directories (claudemarketplaces.com, mdskills.ai, claudepluginhub.com) and called the
  go-to HTML option by roundup posts, e.g.
  [bleap.finance](https://www.bleap.finance/en-us/blog/best-claude-skills-for-presentations)
  (**Reported**; SEO-style listicle, low weight). A fork,
  [frontend-slides-editable](https://github.com/archlizheng/frontend-slides-editable) (555 stars),
  adds in-browser editing (**Verified**, description only).
- Fit tonight: **high**. Fast to install, good-looking output, style picker suits a 4-person team
  deciding quickly. Needs our own work for: offline fonts, the QR code image, the benchmark chart
  (ask for inline SVG, no chart CDN), speaker notes. **Assumption** on those workarounds.

### 2. calhacks-kit (georgeykalangi): `hack-pitch` and `hack-showtime`

- URL: https://github.com/georgeykalangi/calhacks-kit
- **Verified** ([README](https://github.com/georgeykalangi/calhacks-kit/blob/main/README.md)):
  six Claude Code skills (scope, stack, check, ship, pitch, showtime) that share a `HACK.md` plan
  file. "Unofficial. Made by a Cal Hacks mentor ... Not affiliated with or endorsed by Cal Hacks."
- `hack-pitch`, **Verified** ([SKILL.md](https://github.com/georgeykalangi/calhacks-kit/blob/main/skills/hack-pitch/SKILL.md),
  70 lines): writes `PITCH.md` with a timed script (open strong 15s, demo 60-75s, tech 20s, impact
  10-15s for a 2-minute pitch; "scale proportionally for longer slots"), a 30-second version, roles
  (driver, narrator, tech answers, backup with video + hotspot), and 1-2 sentence answers to 8
  judge questions (including "What's mocked or hardcoded?" and "Which sponsor track does this
  fit?"). Rehearse three times with a timer.
- `hack-showtime`, **Verified** ([SKILL.md](https://github.com/georgeykalangi/calhacks-kit/blob/main/skills/hack-showtime/SKILL.md),
  [deck-template.html](https://github.com/georgeykalangi/calhacks-kit/blob/main/skills/hack-showtime/deck-template.html),
  [themes.md](https://github.com/georgeykalangi/calhacks-kit/blob/main/skills/hack-showtime/themes.md)):
  6-7 slide demo-first outline mapped to judging criteria, up to 3 appendix slides for Q&A
  ("deeper architecture, evaluation results, limits"), architecture `.flow` layout with the hard
  part highlighted, `?check` overflow detection, headless-Chrome screenshots and
  `--print-to-pdf` export, F for fullscreen, N for speaker notes. Writing rules: claims as
  headlines, at most 25 words per slide, every number sourced in notes, never mock a screen that
  does not exist. The template has **no external URLs** (we grepped it) and every theme uses
  system font stacks, so it works fully offline.
- Output: one self-contained `showtime/deck.html` + `showtime/deck.pdf`. No PPTX (it points to the
  Anthropic pptx skill for that).
- Install, **Verified**: `/plugin marketplace add georgeykalangi/calhacks-kit` then
  `/plugin install calhacks-kit@calhacks-kit` (skills become `/calhacks-kit:hack-pitch` etc.), or
  `git clone https://github.com/georgeykalangi/calhacks-kit` and
  `cp -r calhacks-kit/skills/* ~/.claude/skills/` for short names (`/hack-pitch`).
- License: MIT (**Verified**, manifest + LICENSE file present). Created 2026-10-16, last push
  2026-10-16 (**Verified**, API): written and pushed in one day, never updated since.
- Popularity: 6 stars, 0 forks, 0 open issues (**Verified**). No community discussion found.
- Fit tonight: **high on content, low on track record.** Structure is the closest match to our
  brief (demo cue slide, architecture, limits/honesty, Q&A appendix). Its default order (demo
  second) differs from ours (problem before demo); we would tell it our slide list. The skills
  are short Markdown files, so the team can read all of them in five minutes before trusting them.

### 3. Anthropic `pptx` skill (anthropics/skills, `document-skills` plugin)

- URL: https://github.com/anthropics/skills/tree/main/skills/pptx
- **Verified** ([SKILL.md](https://github.com/anthropics/skills/blob/main/skills/pptx/SKILL.md)):
  creates decks by writing a `pptxgenjs` script, edits existing decks via XML, validates output
  (`scripts/office/validate.py`), renders to PDF/images via LibreOffice for visual QA. "Keep charts
  native. Use `addChart()`", i.e. editable PowerPoint charts, good for the ASR / false-positive /
  latency slide. Design rule "Every slide needs a visual element".
- Dependencies, **Verified** (SKILL.md "Dependencies"): `pptxgenjs` (npm), `markitdown[pptx]`,
  Pillow, defusedxml, lxml (pip), LibreOffice, Poppler. SKILL.md says pptxgenjs is "preinstalled"
  — true in Anthropic's sandbox, **Assumption**: not on our laptops, so expect 10-20 minutes of
  installs in Claude Code locally.
- Install, **Verified** ([repo README](https://github.com/anthropics/skills/blob/main/README.md)):
  `/plugin marketplace add anthropics/skills` then
  `/plugin install document-skills@anthropic-agent-skills`. On claude.ai these skills "are all
  already available to paid plans" (**Verified**, same README), so a teammate on a paid claude.ai
  plan can make the .pptx there with no local setup.
- License: Apache 2.0 for pptx (**Verified**, README + `skills/pptx/LICENSE.txt`). README
  disclaimer: "provided for demonstration and educational purposes only".
- Last push 2026-11-06; 194,243 stars (**Verified**, API, whole repo).
- Fit tonight: **medium.** Best when a .pptx or Google Slides file is required (import the .pptx
  into Google Slides). Less visually distinctive than the HTML skills by default; fully offline
  once rendered (PowerPoint/Keynote/LibreOffice on the presenting laptop).

### 4. beautiful-hackathon-slides (Esther2524)

- URL: https://github.com/Esther2524/beautiful-hackathon-slides
- **Verified** ([README](https://github.com/Esther2524/beautiful-hackathon-slides/blob/main/README.md),
  [SKILL.md](https://github.com/Esther2524/beautiful-hackathon-slides/blob/main/SKILL.md)):
  9-phase workflow for hackathon demo decks: questions, 5 style previews from 13 presets, single-file
  HTML deck, `PLAN.md`, iteration, AI narration script, slots for demo video, or an "animated demo
  slide" (6 archetypes, e.g. Pipeline Walk, Before/After Morph) when the live demo is risky.
- Offline caveat, **Verified**: SKILL.md says HTML decks "Use Google Fonts via CDN". No PDF export
  step found in README or SKILL.md.
- Install: `git clone https://github.com/Esther2524/beautiful-hackathon-slides.git ~/.claude/skills/beautiful-hackathon-slides`
  (**Verified**; "Plugin Marketplace publishing is coming soon").
- License MIT; 37 stars, 0 forks; last push 2026-05-15 (**Verified**).
- Fit: **medium.** The animated "Before/After Morph" demo slide could illustrate attack blocked vs
  not blocked, but it overlaps heavily with frontend-slides, is far less used, and is aimed at
  demo *videos* more than live stage pitches.

### 5. Marp (marp-cli) + a Marp skill

- Tool: https://github.com/marp-team/marp-cli. **Verified**
  ([README](https://github.com/marp-team/marp-cli/blob/main/README.md)): Markdown to HTML, PDF,
  PPTX, images (`npx @marp-team/marp-cli@latest deck.md --pdf` / `--pptx`). Default PPTX is
  pre-rendered images ("contents cannot [be] modif[ied]"); `--pptx-editable` is experimental and
  needs LibreOffice. A browser (Chrome/Edge/Firefox) is required for PDF/PPTX/images. MIT, 3,920
  stars, last push 2026-09-08.
- Skill: [robonuggets/marp-slides](https://github.com/robonuggets/marp-slides): **Verified**
  (README) teaches Claude SVG charts, metric cards, gauges, with 22 example decks; install by
  `git clone` + `claude --add-dir ./marp-slides` and the Marp for VS Code extension. **No licence
  file** (LICENSE returns 404; API licence null) — flag. 335 stars, last push 2026-04-08.
  [minorun365/minorun-marp-skill](https://github.com/minorun365/minorun-marp-skill) (418 stars,
  Apache-2.0, pushed 2026-11-13) is active but documented in Japanese (**Verified**, description).
- Community: a freeCodeCamp tutorial on Claude Code + Marp
  ([link](https://www.freecodecamp.org/news/how-to-use-claude-code-and-marp-to-think-through-presentations/))
  and older HN threads on Marp ([34501901](https://news.ycombinator.com/item?id=34501901),
  [41709690](https://news.ycombinator.com/item?id=41709690)) (**Reported**, titles/snippets only;
  HN could not be opened).
- Fit: **medium-low tonight.** Live preview inside VS Code is nice for a team already in VS Code,
  and PPTX + PDF come from one command, but the visual ceiling is lower and PPTX is image-only.

### 6. Slidev official skill

- URL: https://github.com/slidevjs/slidev/tree/main/skills/slidev. **Verified**
  ([SKILL.md](https://github.com/slidevjs/slidev/blob/main/skills/slidev/SKILL.md),
  [docs/guide/work-with-ai.md](https://github.com/slidevjs/slidev/blob/main/docs/guide/work-with-ai.md)):
  official skill, install `npx skills add slidevjs/slidev`; Slidev also has a built-in MCP server
  (`claude mcp add --transport http slidev http://localhost:3030/__mcp`). Needs Node >= 22.12 and
  pnpm; export to PDF/PPTX/PNG needs `playwright-chromium`. Mermaid diagrams built in (useful for
  the architecture slide). MIT, 49,464 stars, last push 2026-11-05.
- Fit: **low tonight.** Strong tool, but a Vite/Vue project with a dev server is more setup and more
  things to break on stage than a single HTML file. Good choice only if a teammate already knows it.

### Pitch-structure guidance (not slide generators)

- calhacks-kit `hack-pitch` (above): the only one found that is hackathon-specific and covers
  timing, roles and judge Q&A. **Verified**.
- [Stevekaplanai/pitch-deck-mastery-skill](https://github.com/Stevekaplanai/pitch-deck-mastery-skill):
  **Verified** (README) "investor-grade" 12-slide framework pointing to YC Library, Slidebean etc.
  MIT, 11 stars, pushed 2026-08-16. Aimed at fundraising, not a 3-minute technical demo: skip.
- [emotixco/claude-skills-founder](https://github.com/emotixco/claude-skills-founder) (841 stars,
  MIT) and [Jakeschincariol/seed-skill](https://github.com/Jakeschincariol/seed-skill) (106 stars,
  MIT): founder/investor skill packs (**Verified**, descriptions only, not read further). Not a fit
  for judging.
- Anthropic `theme-factory` (example-skills plugin): **Verified**
  ([SKILL.md](https://github.com/anthropics/skills/blob/main/skills/theme-factory/SKILL.md)) 10
  preset colour/font themes to apply to slides. Optional polish only.

### Looked at and set aside

- Official marketplace [claude-plugins-official](https://github.com/anthropics/claude-plugins-official):
  no dedicated slide/pitch plugin. Nearest is `canva` (Canva MCP server, **Verified** in
  marketplace.json) — needs a Canva account and network; flag as account-dependent.
- [alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design) (29,451 stars, MIT) and
  [chuspeeism/dashi-ppt-skill](https://github.com/chuspeeism/dashi-ppt-skill) (10,676 stars,
  **AGPL-3.0**): popular, but Chinese-first docs and broader scope (**Verified**, descriptions only,
  not read further).
- [genspark-ai/genoffice](https://github.com/genspark-ai/genoffice) (12,320 stars, Apache-2.0):
  a full office suite from a commercial AI vendor, not a Claude skill (**Verified**, description).
- [tfriedel/claude-office-skills](https://github.com/tfriedel/claude-office-skills): repackaging of
  office skills, no licence in API, last push 2026-04-01 (**Verified**). Use the Anthropic original.
- Skill aggregator sites (claudemarketplaces.com, mdskills.ai, claudepluginhub.com, skillselion.com
  ...) mostly mirror GitHub repos, some via forks. **Assumption**: install from the original GitHub
  repo, never from a mirror's `npx` installer.

## Do this tonight

Each teammate who will edit the deck does steps 1-2 on their own machine. Read the SKILL.md files
before running them (they are short Markdown and run with your agent's permissions).

1. **Install** (in a terminal, ~2 minutes):

   ```bash
   git clone https://github.com/zarazhangrui/frontend-slides.git ~/.claude/skills/frontend-slides
   git clone https://github.com/georgeykalangi/calhacks-kit /tmp/calhacks-kit
   mkdir -p ~/.claude/skills
   cp -r /tmp/calhacks-kit/skills/hack-pitch ~/.claude/skills/
   cp -r /tmp/calhacks-kit/skills/hack-showtime ~/.claude/skills/   # backup deck route
   ```

   Start a new Claude Code session in VS Code; `/frontend-slides` and `/hack-pitch` should appear.

2. **Script first** (~30 min): `/hack-pitch We have a 3-minute live pitch on stage plus Q&A, Cisco
   track "Securing the Future of Human-AI Coexistence", AI security platform demo, 4 presenters.`
   It writes `PITCH.md`. Ask it to add Q&A answers on MITRE ATLAS mapping, false positives,
   latency overhead, what is mocked, and human oversight.

3. **Deck** (~60-90 min): `/frontend-slides` with our slide list and the line: "Use only system
   fonts or font files saved next to the HTML, no network requests; charts as inline SVG; speaker
   notes on every slide." Slides: title/hook; problem; architecture diagram; live-demo transition
   with QR code; MITRE ATT&CK/ATLAS kill chain; benchmark chart (attack success rate with vs without
   protection, false-positive rate, latency); What works / What's conceptual / Limitations;
   ethics and human oversight. Pick a dark security preset (e.g. "Neon Cyber" or "Terminal
   Green").
   - QR code: generate offline and save as an image next to the deck, e.g. `npx qrcode -o qr.png
     "<demo URL>"` (**Assumption**: `qrcode` npm package CLI; any offline generator works).
   - Benchmark numbers: real measurements only, source each in the speaker notes (the rule
     `hack-showtime` enforces; judges will ask).

4. **Offline test** (~15 min): turn Wi-Fi off, open the HTML, step through every slide at the
   projector resolution. Fix anything that changed.

5. **Backups**: `bash ~/.claude/skills/frontend-slides/scripts/export-pdf.sh ./deck.html` (run it
   once tonight while online: first run downloads Chromium). Put `deck.html`, its asset folder,
   the PDF and a demo screen recording on two laptops and a USB stick.

6. **Only if a .pptx / Google Slides file is required**: install the Anthropic skill
   (`/plugin marketplace add anthropics/skills`, `/plugin install document-skills@anthropic-agent-skills`)
   or use claude.ai (paid plan) with the same outline, then import the .pptx into Google Slides.

7. **If frontend-slides fights us** (fonts, layout): switch to `/hack-showtime`, which is offline by
   design and reads the same `PITCH.md`; tell it our slide order instead of its demo-second default.

8. Rehearse the full 3 minutes with a timer three times (from `hack-pitch`).

## Sources not reached

reddit.com / old.reddit.com (proxy 403; web search refuses the domain), news.ycombinator.com and
hn.algolia.com (not in allowed network), skills.sh (not in allowed network). To add Reddit/HN
community opinion, allow those hosts in the session's network settings and re-run this research.
