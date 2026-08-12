# Features

Agent Office is mission control for Claude Code: it turns one throwaway terminal agent into a persistent, searchable, cost-capped team of specialists — running in parallel, entirely on your machine.

The raw `claude` CLI gives you one agent in one terminal, and when you close it the conversation is gone. Agent Office turns that into a visual team: many specialist agents scoped to your projects, with every run saved, searchable, and costed — plus the orchestration, memory, and spend controls the CLI doesn't have. And a full REST + SSE API sits under every feature, so anything you can click you can also script.

> [!NOTE]
> New here? Read [Concepts](#/concepts) for the plain-English mental model, then [Getting Started](#/getting-started) to install.

## Agent Office vs. the raw CLI

| | `claude` CLI | Agent Office |
|---|---|---|
| **History** | Lost on exit | Every run saved and searchable — transcript, cost, tokens, tool calls |
| **Cost** | Untracked | Per-run cost tracked; spend dashboards, per-instance/per-project breakdowns, plan-usage meters |
| **Multi-step work** | Manual | Pipelines (sequence · parallel · human-gate · condition) + broadcast |
| **Scope** | Current terminal directory | Per-project rosters, multi-instance with git-worktree isolation |
| **Finding past work** | Scrollback | Full-text search + parent→sub-agent run tree |
| **Memory** | Manual paste | Three memory tiers injected automatically |
| **Agents** | One, ad-hoc | A curated roster of specialists you can edit, plus your own `.md` files |
| **Interface** | Text only | Compare runs, command palette, project tabs |

*Everything stays local under `~/.claude` — but so does the raw CLI's own state, so this is reassurance, not an advantage over the CLI.*

## What's inside

### Nothing is ever lost

- **Every run saved and searchable** — full transcript, tokens, cost, and tool calls in local SQLite. See [Usage → Run history](#/usage).
- **Full-text search** — search every message across every run, from Cmd+K or the titlebar. See [Interface → Full-text search](#/interface).
- **Run tree** — see which orchestrator dispatched which sub-agents, as a collapsible hierarchy — proof of real orchestration. See [Usage → Run tree](#/usage).
- **Compare runs** — side-by-side diff of two runs' cost, tokens, and output. See [Interface → Compare runs](#/interface).
- **Reconnect-safe streaming** — output streams live via SSE and keeps flowing in background tabs; return mid-token. See [Interface → Project tabs](#/interface).

### Stay on top of cost

- **Spend tracking** — every run's cost, tokens, and runtime saved to SQLite; visible per-instance and per-project. See [Usage → Spend tracking](#/usage).
- **Cost dashboards** — spend/runs/runtime trends, model split, per-agent and per-project rankings, tool usage, and a per-account breakdown. See [Interface → Analytics page](#/interface).
- **Usage & spend modal** — daily spend and per-agent cost over a period, plus your Claude plan badge (read from credentials; derived from your local run history, not a read of Anthropic's limits). See [Interface → Usage & spend modal](#/interface).

> Agent Office reports spend but does not enforce hard dollar caps — set a budget ceiling at the Anthropic account level if you need one.

### Orchestrate a team

- **Multi-instance + worktree isolation** — drop the same agent onto a project many times; each gets its own isolated git worktree so parallel instances run at once without colliding. This is genuinely hard to do by hand — it's the standout. See [Usage → Multi-instance & worktrees](#/usage).
- **Message queue** — line up prompts while a run is streaming; they dispatch in order, editable until they start. See [Interface → Message queue](#/interface).
- **Pipelines** — chain agents in sequence, run groups in parallel, pause for a human gate, or skip on a condition. See [Usage → Pipelines](#/usage).
- **Schedules** — run an agent at a set time, or auto-resume a run the moment its rate limit resets — no babysitting. See [Schedules](#/schedules).
- **Curated roster** — specialist agents bundled for convenience: dev tiers, C-suite advisors, QA, engineering, research. The CLI already supports `.md` subagents; this is a ready-made starting set, not a lock-in. See [Agents → Starter roster](#/agents).

### Memory & skills

- **Three memory tiers** — global, per-project, and per-agent notes injected into every run. Agents can even write their own. See [Memory](#/memory).
- **Skills** — reusable behavior packs; install from GitHub registries with cost pills and conflict warnings. See [Agents → Skills](#/agents).

### A real workspace

- **Scriptable** — a full REST API + SSE stream sits under every feature; drive the whole app from your own tooling. See [Reference → REST API](#/reference).
- **Project tabs** — hold multiple projects open Chrome-style; each tab's chat, stream, and draft are preserved. See [Interface → Project tabs](#/interface).
- **Command palette** — Cmd+K to jump to any page and fire quick actions (toggle theme, abort all, open panels). See [Interface → Command palette](#/interface).
- **Multi-account** — connect several Claude accounts, see per-account usage in Analytics, and register GitHub identities per project. See [Interface → Settings](#/interface).
- **Workflows, drafts, attachments** — reuse curated multi-step prompts, autosave composer text, drop or paste files and images. See [Interface → Chat features](#/interface).
- **Processes panel** — every dev server and build the app spawns, with live logs and stdin. See [Usage → Processes panel](#/usage).
- **Project actions** — dev / build / install / clear-cache / open-folder, plus a git status widget and template bootstrapping. See [Projects → Actions](#/projects).
- **Office view** — an isometric office (or a flat card grid) with a desk per agent and live status LEDs; one of several ways to see your team, not the point of the app. See [Usage → Office floor](#/usage).

### Local-first & portable

- **Everything on your machine** — all data lives under `~/.claude`; nothing leaves except API calls to Anthropic. See [Reference → Data & storage](#/reference).
- **Export / import a project** — move agents, roster, memory, and office layout to another machine. See [Reference → Save / export / import](#/reference).
- **Roster migration** — accept bundled agent updates while your custom agents stay untouched. See [Usage → Roster migration](#/usage).
