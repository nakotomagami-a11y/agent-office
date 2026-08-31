# Agent Office

> [!WARNING]
> **🚧 Heavily under active development.** Agent Office is pre-1.0 and changes fast. Expect breaking changes, half-built features, rough edges, and undocumented behaviour. Data formats and the on-disk layout under `~/.claude/` may change without migration. **Back up your data, and don't rely on it for anything critical.**

> Your Claude Code agents, visualized as a living isometric office. Summon, orchestrate, and watch them work in real time.

Personal multi-agent IDE for developers running 3+ Claude Code subagents on real projects. Pick a project, scope a roster, drop a prompt, see streamed output - all inside a dark desktop shell with a pixel-art office floor.

## Screenshots

**Inside a project** — live runs, roster, environment, and stats at a glance:

![Project](screenshots/project.png)

**Multi-agent orchestration** — one agent plans and dispatches sub-agents (done · running · queued), streamed back into the chat:

![Orchestration](screenshots/chat-orchestrator.png)

**Every project, one tab bar away** — switch context without losing your place:

![Projects](screenshots/projects.png)

<details>
<summary><b>More screenshots</b> — chat, activity, agents, memory, skills, analytics, schedules, servers</summary>

|  |  |
| --- | --- |
| Agent chat with a spawned sub-agent | Activity feed |
| ![Chat](screenshots/chat-developer.png) | ![Activity](screenshots/activity.png) |
| Rate-limited run | Interrupted run |
| ![Rate limited](screenshots/chat-frontend.png) | ![Interrupted](screenshots/chat-backend.png) |
| Agents library | Memory (global · project · per-agent) |
| ![Agents](screenshots/agents.png) | ![Memory](screenshots/memory.png) |
| Skills registry | Cost analytics |
| ![Skills](screenshots/skills.png) | ![Analytics](screenshots/analytics.png) |
| Scheduled tasks | Running servers |
| ![Schedules](screenshots/schedules.png) | ![Servers](screenshots/processes.png) |

</details>

<sub>Screenshots are captured against a fake, leak-free demo dataset — see [`scripts/screenshot-app.sh`](scripts/screenshot-app.sh).</sub>

## Features

### Orchestration
- **Summon** any agent against any project with live SSE-streamed output and full transcript history
- **Workflow spawn tree** - live sub-agent tree with per-node status badges and cost; shown in chat via the WorkflowPill dropdown while an orchestration is running
- **Multi-instance agents** - run the same agent 3x in parallel on different scopes (each gets its own transcript, draft, and run history)
- **Pipelines** - multi-step orchestrator dispatch: one agent plans, dispatched subagents execute, results streamed back
- **Workflows library** - a curated set of reusable, multi-step prompts; opened from the composer (Ctrl+P) or saved from any message
- **Abort all** - kill every running agent with one click
- **Rate-limit warning** - dedicated card in the chat thread when a run hits API rate limits

### The office
- **Isometric pixel-art floor** rendered with Pixi.js - drag agents from the sidebar onto grass tiles, decorate the scene, persist to SQLite
- **Animated unit sprites** - 5 factions × 5 unit kinds (Pawn, Warrior, Archer, Monk, Lancer); each agent gets a sprite set by its `unit` frontmatter field
- **Pawn action animations** - working pawns switch sprite sheets based on surroundings: axe near trees, pickaxe on rocks, knife near sheep, hammer otherwise
- **5 grass color themes** - Meadow (yellow), Forest (green), Spring (light), Marsh (olive), Frost (teal); per-scene choice
- **Cards view** - toggle between isometric grid and compact card layout from the office toolbar
- **Build mode** - paint terrain, flood-fill (F), place 60+ decorations, swap grass colour, full undo/redo (Cmd+Z), decoration search
- **Auto-tiling path tiles** - dirt paths connect to cardinal neighbours automatically; drawn via PixiJS Graphics (no PNG dependency)
- **Bridges** - place horizontal/vertical bridge planks on water; end-caps auto-render on adjacent land tiles; agents stand elevated on bridges
- **Voronoi water shader** - animated teal cellular water pattern behind the island
- **Pixel-planet project icons** - each project gets a deterministic procedural WebGL2 planet icon (11 types: gas giant, rocky, terran, ice world, lava, etc.)
- **Smooth pan/zoom** - Ctrl+Scroll zooms to cursor; arrow keys / drag to pan

### Knowledge & memory
- **Per-agent memory editor** - edit `~/.claude/agents/<id>.md` definitions inline
- **Global memory editor** - manage the machine-wide `CLAUDE.md`
- **Skills registry** - browse, install, and auto-update Claude Skills from configured sources
- **Docs viewer** - in-app browser for exported run docs

### Discovery & history
- **Global search** across every run, message, and transcript
- **Activity feed** - chronological view of every summon
- **Spend tracking** - cost-per-agent, cost-per-project, daily totals
- **Run detail pages** - full transcript with cost, tokens, model, duration
- **Analytics dashboards** - spend/runs/runtime trends, model split, per-agent and per-project rankings, tool usage, activity heatmap; per-account breakdown when multiple Claude accounts are connected
- **Command palette** (Cmd/Ctrl+K) - jump to any page plus quick actions (toggle theme, abort all runs, open the Processes and Flutter panels)

### Integrations
- **Multi-account** - connect several Claude accounts, see per-account usage in Analytics, and switch the account a run bills against
- **GitHub accounts** - register GitHub identities per project for worktree/PR work
- **Git worktrees** - each project's worktree tree is tracked and surfaced; missing worktrees auto-recreated on next summon
- **Branch detection** - active branch shown next to project
- **Dev-server tracking** - long-running dev servers managed and visible in the Processes modal
- **Clipboard image paste** - paste screenshots straight into the composer
- **Usage & spend** - read-only daily spend and per-agent cost over a day / week / month period, plus your Claude plan badge (from local run history; not a read of Anthropic's account limits, and no dollar cap is enforced)
- **Sleep inhibitor** - keeps the machine awake while runs are streaming

### Reliability
- **Crash recovery** - orphan runs left over from a crash are auto-marked on next boot; interrupted pipelines surface a recovery banner
- **Self-healing worktrees** - if an instance's worktree directory goes missing, it is recreated automatically rather than bricking the instance
- **Atomic file writes** for every persisted markdown asset
- **WAL-mode SQLite** with foreign keys on
- **Export/import** the full app state for backup or migration

### Platform
- **Browser** at `localhost:3000` for daily use
- **Tauri desktop bundle** with a custom titlebar (traffic-light window controls)
- **Mobile bottom nav** - navigate between pages on a phone (the isometric office itself is desktop-first, not yet responsive)
- **i18n** via next-intl (English shipped, structure for more)

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + custom design system (dark "Obsidian" theme, violet accent `#7c6af5`)
- **Pixi.js v8** for the isometric office canvas (GPU-accelerated; PixiJS Graphics for procedural path tiles)
- **`@agent-office/pixel-planets`** — in-house WebGL2 procedural planet renderer; one shared GL context for all project icons
- **Zustand** for client stores, **TanStack Query** + **axios** for server state (API calls live in `src/lib/api/` modules — see [`docs/data-fetching.md`](docs/data-fetching.md))
- **better-sqlite3** at `~/.claude/agent-office/db.sqlite` - runs, messages, transcripts, drafts, pipelines, workflows, UI state
- **framer-motion** for page + modal transitions
- **ts-pattern** + **zod** for typed control flow and validation
- **Tauri v2** for desktop bundling
- Backend runs in-process inside Next.js; shells out to `claude -p` per summon and streams stdout back over SSE

## Monorepo

```
apps/
  web/            Next.js app (UI + API routes + SSE runner)
packages/
  domain/         Types, DB layer, services (runs, agents, pipelines, skills, worktrees, accounts, ...) — imported as @agent-office/domain
  pixel-planets/  WebGL2 procedural planet renderer (@agent-office/pixel-planets)
  pixel-icons/    Procedural pixel-art icon set (@agent-office/pixel-icons)
```

Inside `apps/web/src`:

- `app/(app)/` - pages: office (root `/`), activity, analytics, projects, agents, runs, search, memory, skills, docs, settings
- `app/api/` - REST + SSE endpoints: summon, runs, agents, processes, pipeline, broadcast, workflows, skills, memory, transcripts, drafts, ui-settings, save (export/import), templates, projects, settings, analytics, accounts, github-accounts, agent-docs, cleanup, account, health
- `components/layout/` - window chrome, titlebar, sidebar, project switcher, mobile nav
- `components/ui/` - design-system atoms (Icon, StatusDot, Button, Modal, Tabs, ...)
- `components/command-palette/` - Cmd+K palette
- `modules/office/` - isometric scene, Pixi canvas, build toolbar, map overlay
- `modules/summon/` - chat panel, transcript thread, composer, workflow picker, live status
- `modules/workflows/` - workflow (reusable multi-step prompt) picker dialog
- `modules/analytics/` - spend/usage dashboards
- `modules/accounts/`, `modules/github-accounts/` - multi-account management
- `modules/processes/`, `modules/limits/`, `modules/memory/`, `modules/skills/`, `modules/projects/`, `modules/agents/`, `modules/runs/`, `modules/search/`, `modules/settings/`, `modules/docs/`, `modules/flutter/`, `modules/onboarding/`
- `lib/` - Zustand stores (theme, active-project, tabs, claude-limits, processes, dev-server, branch, palette, flutter, performance, compare, toast, ...), the axios `api-client`, and `api/` resource modules

## Run it

Requires **Node 22+** and **pnpm**.

```sh
pnpm install
pnpm dev              # → http://localhost:3000

pnpm build            # next build of apps/web
pnpm start            # production server
pnpm typecheck        # tsc --noEmit across the workspace
pnpm lint
```

Desktop bundle:

```sh
pnpm --filter @agent-office/web tauri:dev
pnpm --filter @agent-office/web tauri:build
```

## Installing a release build (unsigned)

**Pre-built release binaries are Linux-only** — `.deb` and AppImage. There are
no Windows or macOS builds; a code-signing certificate for each of those costs
money per year, and this is a personal project, so those platforms are
source-build-only (see below).

**The Linux build is not code-signed.** There is no OS-level gate on Linux
(unlike macOS Gatekeeper or Windows SmartScreen), so the `.deb` and AppImage
install and run as-is.

Only the *updater* artifacts are signed (a minisign key, so the in-app updater
can verify what it downloads). That is unrelated to OS-level trust.

On any platform, **build from source** instead of using a downloaded binary —
`tauri:build` output is never quarantined, because it was never downloaded:

```sh
pnpm --filter @agent-office/web tauri:build
```

## Architecture notes

- **Agent definitions** are markdown files in `~/.claude/agents/`. The app scans that directory to build the roster and lets you edit definitions inline.
- **Summon** shells out to `claude -p "<prompt>"` per run; stdout streams back over SSE to the chat panel and persists to SQLite as it arrives.
- **Pipelines** are stored as a parent `pipelines` row plus N `pipeline_steps` children; each step is its own `claude -p` invocation, dispatched by the orchestrator agent and tracked independently.
- **Workflows** (a curated library of reusable multi-step prompts, formerly "saved prompts") live in the `saved_prompts` SQLite table; the picker dialog is one keystroke away in the composer (Ctrl+P) and organised by category.
- **Skills** are installable bundles from configured registries; updates are checked against source manifests and surfaced in the Skills page.
- **Sleep inhibitor** acquires a `systemd-inhibit` lock for the duration of any active run so the laptop doesn't sleep mid-task.
- **Crash recovery**: on DB open, any run still marked `running` is flipped to `error` with `exit_code=-1`; any pipeline still `running` is marked `interrupted=1`.

## Status

Personal project, still heavily under development. Not production-grade for shared use - assumes a single local user with `claude` on `$PATH` and a populated `~/.claude/agents/` directory.

Release builds are Linux-only and unsigned — see [Installing a release build](#installing-a-release-build-unsigned). Windows and macOS require building from source.

## License

[GPL-3.0-or-later](LICENSE). The app links against `@agent-office/pixel-icons`, whose generator is GPL-3.0, so the combined work is GPL-3.0-or-later. Two components are separately licensed and remain redistributable on their own terms:

- **`@agent-office/pixel-planets`** — MIT (see `packages/pixel-planets`)
- **`@agent-office/pixel-icons`** — GPL-3.0-or-later source; the pixel-art icons it *generates* are released as [CC0](https://creativecommons.org/publicdomain/zero/1.0/)

## Credits

- **Pixel Planet icons** — WebGL2 port of the [Pixel Planet Generator](https://deep-fold.itch.io/pixel-planet-generator) by [Deep-Fold](https://deep-fold.itch.io/) (MIT).
- **Unit, tile & decoration sprites** and the pixel-icon art style — [Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) by [Pixel Frog](https://pixelfrog-assets.itch.io/) (CC0), also distributed on the [Unity Asset Store](https://assetstore.unity.com/packages/2d/environments/tiny-swords-352566).
