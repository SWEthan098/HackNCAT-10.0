# Agent-Reach (research)

Repository: https://github.com/Panniantong/Agent-Reach (MIT, v1.6.1, inspected 2026-11-13).

## What it is

A read-only command-line tool plus a Claude Code skill that lets Claude search and read platforms
its built-in tools handle poorly: GitHub (repos, READMEs, issues), YouTube (subtitles,
transcripts), Reddit, V2EX, Bilibili, plus optional channels (LinkedIn jobs, Twitter/X, Xiaohongshu,
Xueqiu stock quotes and more). Every command prints one JSON object with `items` (title, url,
author, date, text). It never posts, likes or messages, and never asks for passwords.

It is a **developer tool on each machine**, not a dependency of the app.

> The PyPI package named `agent-reach` is a different project. Install only from the GitHub URL below.

## Installation (as done on 2026-11-13, per the repo's `docs/install.md`)

```bash
# 1. uv (installed here from PyPI: python -m pip install --user uv;
#    the official alternative is the Astral installer script)
# 2. the tool, from the GitHub release:
uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
# 3. default channels + the skill:
agent-reach setup
```

What `setup` changed (read from its source before running it):

- Tool state in `~/.agent-reach/`; the CLI at `~/.local/bin/agent-reach.exe`.
- The skill at `~/.agents/skills/agent-reach/`, copied to `~/.claude/skills/agent-reach/` (and
  `~/.copilot/skills/agent-reach/` because a Copilot config folder exists). The existing
  `hallmark` and `synced` skills were left alone.
- Private per-channel tools (for example `bili-cli`) under `~/.agent-reach/`.

Verification on 2026-11-13: `agent-reach version` returned 1.6.1; `agent-reach read
https://github.com/Nutlope/hallmark` returned the README (channel `github`); `agent-reach check web`
showed 2/2 actions working, through Exa after the Jina reader returned 401; `agent-reach add
youtube` succeeded on a second try (the first setup run hit a transient permissions error
installing ffmpeg). The `agent-reach` skill shows up in Claude Code's skill list.

`~/.local/bin` was then added to the user PATH with `uv tool update-shell` (2026-11-13); new
terminals find `agent-reach` directly.

**Teammates** install it the same way on their own machines (JLee first, as research owner):

```bash
python -m pip install --user uv            # or the official Astral installer
uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
uv tool update-shell                       # then open a new terminal
agent-reach setup
agent-reach doctor --text                  # check what works
```

## Using it

In Claude Code just ask; the skill decides when to use it (it prefers Claude's own web tools for
ordinary public pages):

- "Use agent-reach to read the README and open issues of `cisco-en-programmability/...`"
- "Get the subtitles of this YouTube talk and pull out every API they mention: <url>"
- "Search Reddit for complaints about hospital device-alarm fatigue in the last year"

Directly:

```bash
agent-reach channels                         # every channel, action and parameter
agent-reach read <url>                       # picks the channel from the URL
agent-reach github search "medical device anomaly detection" --limit 5
agent-reach github read owner/repo           # README, or an issue/PR with comments
agent-reach web search "Lenovo smart manufacturing edge AI" --limit 5
agent-reach youtube subtitle <url>           # full captions; `youtube transcribe` needs a Groq/OpenAI Whisper key
agent-reach doctor --text                    # what works right now
agent-reach add reddit                       # turn on an optional channel
```

## Accounts, keys and dependencies

- Default channels (web, github, youtube, v2ex, bilibili) need no account or key.
- Login-walled channels (Twitter/X, LinkedIn, Xiaohongshu) reuse a login you perform yourself:
  `agent-reach login <channel>` opens a browser. Use a secondary account.
- Podcast transcription (Xiaoyuzhou) needs a Groq key: `agent-reach configure groq-key`, typed in
  your own terminal, never pasted into chat.
- Some channels install Node.js, a dedicated browser (CloakBrowser or Chrome) or ffmpeg privately
  under `~/.agent-reach`.

## Research rules for the challenge

Results feed `challenge/RESEARCH.md`. Each claim gets a source URL and a label: **Verified** (read in
the primary source), **Reported** (secondary source) or **Assumption** (our inference). Note which
items came back as snippets rather than full text: Agent-Reach marks them, and they are not
evidence.

## Updating or removing

`agent-reach update` (only when you choose to), `agent-reach uninstall --dry-run` then
`agent-reach uninstall`, then `uv tool uninstall agent-reach`.
