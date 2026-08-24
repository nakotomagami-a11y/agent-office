# Getting Started

You already run Claude Code. Agent Office keeps everything it forgets — every run, every dollar, every agent — and lets you run ten at once. It's a local desktop app that wraps the Claude Code CLI in a visual, persistent workspace. This page gets you from a fresh install to your first run.

> [!TIP]
> Want the value pitch first? See [Features](#/features) for what Agent Office adds on top of the raw CLI, or [Concepts](#/concepts) for the plain-English mental model.

> [!NOTE]
> Agent Office wraps the Claude Code CLI — you need that installed and an Anthropic API key configured before anything will run.

## Prerequisites

### 1. Claude Code CLI

Agent Office spawns `claude` as a subprocess for every run. Install it first:

```bash
npm install -g @anthropic/claude-code
```

Verify with `claude --version`. The health check at `GET /api/health` also confirms availability.

### 2. Anthropic API key

Configure an Anthropic API key in your environment. Agent Office reads this from `~/.claude/.credentials.json` when the CLI is installed.

```bash
export ANTHROPIC_API_KEY="sk-ant-…"
```

### 3. Platform availability

- Linux (Wayland or X11)
- macOS
- Windows via WSL2

Some features are Linux-only (clipboard image paste via `wl-paste`, `lsof` for the Processes panel).

## Quick start

Three steps from a fresh install to your first run.

### Step 1 — Import a starter agent

Launch the app; the first-run wizard opens automatically. Pick one or more starter agents (`developer` is a good default) and click **Import**. Each import copies a `.md` file into `~/.claude/agents/`.

### Step 2 — Create a project

Click **New project**, pick a directory on disk, name it. Agent Office stores project metadata under `~/.claude/projects/<id>/project.md`.

### Step 3 — Summon an agent

Drag the agent from the sidebar into the project roster. Click the agent to open the chat panel. Type a prompt, hit **Send**. Output streams back live via SSE.

That's it. Everything else — office floor layout, memory tiers, pipelines, cost tracking — is on top of these three primitives.

## First-run wizard

The wizard walks new installs through the same three steps above, plus a few app-level settings.

### Wizard steps

1. **API key check** — confirms `~/.claude/.credentials.json` exists.
2. **Starter agent import** — lists agents bundled at `apps/web/starter-data/agents/` and lets you pick which to install. Already-present files are skipped.
3. **Project root** — pick a default parent directory for future projects (e.g. `~/Documents/Lab`).
4. **Confirm** — writes settings + agents, marks `firstRunComplete: true`.

### What gets created on finish

- `~/.claude/agents/*.md` — one file per imported starter.
- `~/.claude/agent-office-settings.json` — `projectsRoot`, `excluded`, `firstRunComplete`.
- No projects yet — you create the first one manually after the wizard closes.

### Re-running the wizard

Delete or edit `~/.claude/agent-office-settings.json` and remove `firstRunComplete`. The wizard reopens on next launch.
