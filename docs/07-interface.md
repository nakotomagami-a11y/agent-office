# Interface

Every screen, modal, panel, and shortcut in the app. Read this if you want to know "where does X live?" — you'll find it here.

## Jump map

This page is long. Here's the lay of the land — every section below, grouped:

- **Shell & navigation** — [Layout](#/interface) · [Project tabs](#/interface) · [Sidebar](#/interface) · [Command palette](#/interface)
- **Agent details** — [the modal](#/interface) and its four tabs: [Conversation](#/interface) · [History](#/interface) · [Memory](#/interface) · [Settings](#/interface)
- **Chat** — [Message queue](#/interface) · [Drafts](#/interface) · [Attachments](#/interface) · [Slash commands](#/interface) · [Workflows](#/interface)
- **Standalone pages** — [Settings](#/interface) · [Memory](#/interface) · [Skills](#/interface) · [Analytics](#/interface) · [Search](#/interface) · [Activity](#/interface)
- **Modals & panels** — [Compare runs](#/interface) · [Claude limits](#/interface) · [Migration](#/interface) · [Processes](#/interface) · [Flutter](#/interface) · [Bootstrap project](#/interface)
- **System** — [Keyboard shortcuts](#/interface) · [Themes](#/interface) · [Reduced motion](#/interface) · [Performance mode](#/interface) · [Notifications](#/interface)

## Layout — the app window shell

The whole app runs inside a custom Tauri window:

- **Titlebar** (top, 38 px) — window controls (traffic lights on Tauri), workspace name, dev menu, refresh, theme toggle. Always visible; sits above every modal so it stays clickable.
- **Tab strip** (below titlebar, 36 px) — Chrome-style project tabs. See "Project tabs" below.
- **Sidebar** (left, resizable) — pinned agents grouped by room, memory + skills + settings entry points.
- **Main pane** — current route (Office / Projects / History / Docs / Settings / etc.).
- **Mobile bottom nav** — appears on narrow viewports; replaces the sidebar.
- **Resize handles** — grab any window edge to resize (Tauri desktop only).

The layout persists via `ui_settings` — sidebar width, active route, last-opened project, open tabs, closed-tab LRU stack.

## Project tabs

The strip below the titlebar lets you hold multiple projects open at once and switch instantly, Chrome-style.

- **`+` button** (far left) — opens the project picker dropdown. Click any project to open it as a new tab, or focus the existing tab if that project is already open. "New project…" at the bottom creates one from scratch.
- **Tabs** — each tab shows the project's planet icon + name. Click to activate. Middle-click or the hover-X to close. Right-click for **Close / Close others / Close tabs to the right / Reopen closed tab**. Drag to reorder.
- **State preservation** — switching tabs doesn't unmount your conversation. The chat thread, active stream, composer draft, message queue, and every per-`tKey` piece of chat state is preserved by a global registry keyed on `<agentId>::<instanceId>`. Live SSE streams keep flowing in the background of tabs you left; return and pick up mid-token.
- **Persistence** — the tab list + closed-tab stack are stored in `ui_settings.tabs-state`. Reopening the app restores every open tab; deep-linking `/projects/<id>` in the URL opens a fresh tab automatically.
- **Keyboard** — see the "Keyboard shortcuts summary" section at the bottom.

## The sidebar (roster group)

Each agent line shows:

- Tiny Swords sprite avatar (colored by faction)
- Human-readable display name (e.g. `cs-ceo` → **CEO**)
- Status LED (see [Office → Status LEDs](#/usage))
- Instance count badge (if the agent has multiple instances)

Right-click an agent for:

- **Spawn new instance** in the active project
- **Open agent details**
- **Remove from project**
- **Copy slug**

### Multi-instance expansion

If an agent has 2+ instances in the active project, its line becomes expandable — click the caret to see per-instance rows with labels + individual status LEDs.

## Agent details modal

Click any agent (in the sidebar, on the office floor, or in the agent list) to open the details modal. Four tabs across the top:

### Conversation tab

The chat panel. Send a prompt, watch it stream back. Persists across app restarts.

- **Composer** at the bottom with autoresizing textarea
- **Message queue** — you can send multiple messages while one is running; they queue and dispatch in order
- **Drafts** — text in the composer is autosaved to `~/.claude/agent-office/db.sqlite → drafts` and restored when you reopen the tab
- **Attachments** — drop files onto the composer or paste from clipboard (see Clipboard image paste below)
- **Slash commands** — start typing `/` to open the command palette scoped to summon actions

### History tab

Every past run for this agent+instance. Each row shows:

- Timestamp
- Prompt (truncated)
- Status + exit code
- Cost + duration + token counts
- Model + effort
- Expandable to view full transcript

Filters: by date range, by model, by cost threshold. Bulk-delete supported.

### Memory tab

The per-agent memory file. **Write** / **Preview** tabs — Write is a highlighted markdown editor, Preview renders full GFM (tables, code, callouts). `Cmd/Ctrl+S` to save, 256 KB max. See [Memory](#/memory).

### Settings tab

Five sub-sections, each an expandable card:

#### Identity

- `name`, `description` — text inputs
- `id` (slug) — auto-derived from name; editable
- Live preview of the agent card on the right

#### Model & effort

- Model dropdown — aliases only (`haiku` / `sonnet` / `opus` / `fable`)
- Effort dropdown — `low` / `medium` / `high` / `xhigh` / `max`
- Cost estimate per typical run

#### Skills & tools

- **Skills** — searchable chip input with autocomplete. Each suggestion shows a color-coded cost pill (green→red by tier) and the skill category. Selected skills show inline with their cost. Conflict warnings appear above the chip input if two selected skills disagree.
- **Tools** — chip input for the `--allowedTools` list (`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `Task`, etc.). Suggested tools shown as dashed "empty-slot" chips below the selected list.

#### Appearance

- **Avatar picker** — 5-faction × 5-kind grid of Tiny Swords sprites. Click to select. "Reset to auto" reverts to a hash-derived default based on the agent name.
- Current selection shown in the footer with faction label and kind name.

#### System prompt

- Full-height markdown code editor with syntax highlighting (headings, code fences, links, bold/italic).
- **History dropdown** — every version of the body is backed up to `<id>.body.<ISO>.md` (max 10). Pick one to restore.
- **Save** button (or `Cmd/Ctrl+S`) — writes to `~/.claude/agents/<id>.md`.

### Modal URL sync

Modal state is reflected in the URL as query params (e.g. `?modal=agent&agent=developer&instance=developer-3f9a&tab=settings`). Deep-linkable — send someone a URL and they open right on the same screen.

## Chat features (Conversation tab)

### Message queue

While one run is streaming, you can queue additional prompts. They dispatch in order once the current run completes. Queued messages show a small chevron and remain editable until they start.

The queue is per-instance and persists across app restarts.

### Draft persistence

Text in the composer is autosaved on blur or after 500 ms of inactivity. Restored when you reopen the tab. Cleared when you send.

### Attachments

- **Drag-drop** any file onto the composer to attach it.
- **Ctrl/Cmd+V** to paste — text pastes as text, images paste as PNG (Wayland only).
- Attachments upload to `~/.claude/agents/_uploads/<agent-id>/` (or `~/.claude/projects/<id>/_uploads/` if summoned from a project context).
- Multiple attachments are supported per message.

### Clipboard image paste

On Wayland, `POST /api/clipboard-image` reads the clipboard PNG via `wl-paste` and returns it as `image/png`. In the app, `Cmd/Ctrl+V` in the composer automatically converts a clipboard image into an inline attachment.

### Slash commands

Start typing `/` in the composer to open a scoped command menu:

- `/clear` — start a new thread
- `/branch` — fork the current thread
- `/memory` — edit this agent's memory
- `/prompt` — view the composed system prompt
- `/history` — show recent runs

### Workflows

Workflows (formerly "saved prompts") are a curated library of reusable, multi-step prompts, organised by category.

- **Open** — the **Workflows** button in the composer toolbar (`Ctrl+P`) opens the picker; choosing one pastes its body into the composer and records a use via `POST /api/workflows/:id/use`.
- **Save** — right-click a message → *Save as workflow* creates one from existing text.
- **Add / delete** — the picker dialog has an inline add form; workflows are stored in the `saved_prompts` table and served from `/api/workflows`.

## Command palette (Cmd+K)

Press **Cmd+K** anywhere in the app to open the command palette. It is a fixed command list (no dynamic per-agent / per-run rows — use the titlebar search bar for full-text message search). Groups:

**Navigate** — jump to a top-level route or start a common flow:

- Go to Office
- Go to Activity
- Go to Analytics
- Go to Agents
- Go to Projects
- Go to Memory
- Go to Skills
- Go to Settings
- Go to Docs
- Search Runs
- New Agent

**Actions** — Toggle Theme, Stop all running agents (abort all).

**Tools** — Running Servers (Processes panel), Flutter Device Manager.

Type to filter by label or section. Navigate with ↑/↓, Enter to select, Esc to close. The palette open state is held in `palette-store`.

## Compare runs modal

Select 2 or more runs from the History tab, then click **Compare**. Opens a side-by-side view:

- Left column — Run A
- Right column — Run B
- Deltas — cost, tokens, duration, exit code, tool calls
- Diff view of prompt + output for quick visual comparison

Useful for A/B testing model choices or reproducing a regression.

## Usage & spend modal

Toolbar → ⚡ icon opens the usage & spend modal. It's read-only analytics — it
does **not** read Anthropic's session / 5-hour / weekly limits. Shows:

- Your current Claude plan (Free / Pro / Max), read from `.credentials.json`
- Daily spend bars over the selected period (day / week / month)
- Per-agent cost breakdown for the period

Data source: your own `.credentials.json` for the plan badge; the SQLite `runs`
table for all spend figures. Nothing is fetched live from Anthropic.

## Migration modal (first launch after upgrade)

When the bundled agent MANIFEST version changes, the migration modal opens once. Three sections:

- **New in this version** — bundle has agents you don't have
- **Changed since last install** — agent hash differs from local
- **Only in your local install** — read-only surface of your customs

Per-row toggles + "Accept all" / "Skip all". On submit:

- Accepts → local backed up to `_archive/`, bundled copied in
- Skips → recorded so they don't re-nag for this version
- Version stamped so the modal won't re-fire until the bundle changes again

See [Usage → Roster migration](#/usage) for the full model.

## Settings page (`/settings`)

The Settings route has a grouped left rail with these tabs:

**Workspace**

### Projects

- **Projects root** — the parent directory the app scans for candidate projects. Persisted to `~/.claude/agent-office-settings.json` as `projectsRoot`.
- **Exclusions** — chip input of directory names to skip during scan (e.g. `node_modules`, `.next`, `.git`). Persisted as `excluded[]`.
- **Preview** — live list of what the scanner picks up under the current root minus exclusions, so you see the effect of your edits before saving.
- **Save** — writes back via `PUT /api/settings`; `firstRunComplete` is left untouched.

### Bundled agents

Manage the starter roster shipped with the app — review what's bundled, import missing agents, and see the diff against your local copies (the same data that powers the migration modal, via `/api/starter/agents` and `/api/starter/agent-diff`).

**Accounts**

### Claude accounts

Connect one or more Claude accounts. Each row shows live auth/usage status (`/api/accounts/:id/status`); the login flow runs the CLI OAuth handshake (`POST /api/accounts/:id/login` → `POST /api/accounts/:id/login/code`). Multiple accounts let you split usage and see a per-account breakdown in Analytics.

### GitHub accounts

Register GitHub identities (`/api/github-accounts`) so worktree/PR work can be attributed to the right account; assigned per project.

**You**

### About You

Runs the `user-analyst` agent against your local data (message history, run patterns, project inventory) and produces a candid person-portrait. No calls home; everything stays local.

- **Refresh** button — re-runs the analysis (`POST /api/user-analysis`)
- **View history** — every past analysis is saved with a timestamp
- **Export** — download the current analysis as Markdown

**System**

### Performance

Sets the rendering / animation budget — `full` · `lite` · `off` — persisted to `ui_settings.performance-mode`. `lite`/`off` reduce or disable canvas animation and can force the Office into cards view on low-power machines.

### Cleanup

Sweep stored data by kind (e.g. reaped error runs) via `POST /api/cleanup/:kind`, reclaiming space without touching live runs.

> [!NOTE]
> Global Memory, Skills, Analytics, Search, and Activity are top-level routes (`/memory`, `/skills`, `/analytics`, `/search`, `/activity`) reached from the sidebar — NOT sub-tabs of Settings.

### Multi-instance feature flag

`AppSettings.features.multiInstance` (optional, defaults off) toggles whether an agent can be dropped onto the same project more than once. Enable to unlock the multi-instance workflow (per-instance labels, worktrees, chat panels).

## Bootstrap Project modal (`/projects` → New Project)

Scaffolds a fresh project directory from a framework template.

- **Frontend choice** — `next` (Next.js App Router, server components, full-stack), `vite` (SPA, no SSR), `react` (plain library / widget), `none`.
- **Backend choice** — enumerated on the modal (Fastify / Hono / Express / Django / FastAPI / none).
- **Name + directory** — where to write the scaffold.
- **Confirm** — hits `POST /api/projects/bootstrap`; scaffold runs, project row is created, sidebar refreshes.

## Office view — iso vs cards

Two rendering modes for the Office floor, toggled from the office toolbar and persisted in `useOfficeStore.view` (backed by `ui_settings.office-view` on the server):

- `iso` — full isometric floor via PixiJS. Interactive drag-drop, decorations, room walls, agent avatars.
- `cards` — flat grid of agent cards. No isometric transform, no PixiJS renderer. Faster on low-power machines.

The Performance settings can force-select `cards` — see the Performance section below.

## Full-text search bar (titlebar)

The search bar at the top runs against `messages_fts`. Type a phrase, get every message across every run that mentions it. Click a result to jump to the transcript.

Filters (chip-selectable):

- **Agent** — restrict to one agent's messages
- **Project** — restrict to one project
- **Model** — only messages from a specific model
- **Date range** — last 7d / 30d / custom
- **Kind** — `you` / `agent-text` / `tool` / `system`

## Global Memory page (the `/memory` route)

The global memory editor. Same Write/Preview markdown editor as the per-agent memory tab. Applies to every agent, every project. Read on every `summon` call.

## Skills page (the `/skills` route)

- Installed skills list (from `~/.claude/agents/_skills/`)
- Registry browser (from configured GitHub sources), **paginated 50 per page** (Back / Page X of Y / Next)
- Per-skill card actions:
  - **Install** / **Remove**
  - **Source** — opens the skill's folder on GitHub (`github.com/<source>/tree/<ref>/<path>`) in a new tab
  - Edit icon (procedural weapon icon: pick seed + weapon class)
- Source manager: add/remove GitHub sources for skill discovery
- **Registry caching (stale-while-revalidate)** — the registry is served instantly from a local cache and refreshed in the background, so the page never blocks on GitHub. Skill descriptions are reused by git blob SHA, so unchanged skills aren't re-fetched on a refresh. Force a fresh pull with `?refresh=1`.

## Analytics page (the `/analytics` route)

Usage & cost dashboards, scoped by a period selector (7 / 30 / 90 days / all time):

- **Hero band** — headline spend for the period.
- **Trend** — line chart switchable between Spend, Runs, and Runtime.
- **Models** — share of spend by model.
- **Agents** — ranked by spend.
- **Projects** — ranked by spend.
- **Tools** — most-used tools.
- **Activity heatmap** — runs over time.
- **Per-account** — usage split across connected Claude accounts (`/api/analytics/per-account`).

All data pulled from the `runs` table (`/api/analytics/*`). No cloud call.

## Search page (top-level route `/search`)

Full-text search over every stored message. Same engine as the titlebar search bar; standalone route for bookmarking specific queries.

## Activity page (top-level route `/activity`)

Feed of recent activity across all projects: new instances added, runs completed, spend cap alerts, migration events. Useful as a "what happened while I was away" timeline.

## Processes panel (Cmd+Shift+P)

Every dev server, build, and background process spawned by the app. Live status, stream stdio via `GET /api/processes/:pid/logs?since=<offset>`. Send stdin via `POST /api/processes/:pid/stdin`. Kill via `DELETE /api/processes/:pid`.

## Flutter modal (Tools → Flutter)

If the active project is a Flutter app, the Flutter modal exposes:

- **Devices** — enumerated Flutter/Dart devices
- **Mirror** — live-stream a device's screen into the modal
- **Run** — spawn `flutter run` in a terminal
- **Screenshot** — capture the current device screen

Endpoints: `/api/flutter/{devices,mirror,run,screenshot}`.

## Keyboard shortcuts summary

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+K` | Open command palette |
| `Cmd/Ctrl+Shift+P` | Open Processes panel |
| `Cmd/Ctrl+S` | Save (in memory / body editors) |
| `Alt+←` / `Alt+→` | Previous / next instance of the same agent |
| `Esc` | Close any modal |
| `↑` / `↓` (in composer, empty) | Cycle through recent prompts |
| `Enter` in composer | Send |
| `Shift+Enter` in composer | Newline |
| `Cmd/Ctrl+Enter` in composer | Send + queue |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+D` | Toggle Docs modal |
| `Cmd/Ctrl+W` | Close active project tab |
| `Cmd/Ctrl+Tab` | Next project tab (wraps) |
| `Cmd/Ctrl+Shift+Tab` | Previous project tab (wraps) |
| `Cmd/Ctrl+1..8` | Jump to tab N (1-indexed) |
| `Cmd/Ctrl+9` | Jump to the LAST tab (Chrome convention) |
| `Cmd/Ctrl+Shift+T` | Reopen the most recently closed tab (LRU depth 10) |

## Themes

The theme store lives at `apps/web/src/lib/theme-store.ts` and behaves as follows:

- **First load** — reads `ui_settings.theme` from the server. If absent, auto-detects the OS via `window.matchMedia("(prefers-color-scheme: dark)")`.
- **Applies** — writes `[data-theme="dark"]` on `<html>` so Tailwind's `dark:` variants and the token CSS in `packages/ui/src/tokens.css` flip accordingly.
- **Toggle** — the sun/moon icon in the titlebar; also exposed via the command palette.
- **Persistence** — writes back to `ui_settings.theme` on change (best-effort; failures don't block the DOM update).

## Reduced motion (accessibility)

The app partially honors `@media (prefers-reduced-motion: reduce)` — several animations (pulse, shimmer, chat-jump-latest, cursor blink) drop to a single frame. The Performance settings below extend this to every animation regardless of OS setting.

## Performance mode

Global setting persisted to `ui_settings.performance-mode`. Three levels:

| Mode | Effect |
|---|---|
| `full` (default) | Everything on: iso office renderer + PixiJS, framer-motion transitions, CSS keyframes, backdrop-blur, drop shadows, procedural planet icons, hover transitions. |
| `lite` | Office view forced to `cards`. Non-essential CSS animations off. Framer-motion transitions set to 0 ms. Backdrop-blur removed. Planet icons render as flat color fallback. Status LEDs still animate (essential feedback). |
| `off` | Everything from `lite` PLUS: no hover transitions, no shimmer, no chat message-in animations, no auto-scroll smoothing. Utilitarian rendering. |

Auto-detect: on first launch, if the browser reports `prefers-reduced-motion: reduce`, the default flips to `lite` and a small notice surfaces on the About You tab (not blocking).

Change from Settings → Performance. Takes effect immediately (no reload needed) via the `[data-perf]` attribute on `<html>` gating CSS rules.

## Notifications

Long-running runs (> 30 s) trigger a system notification on completion if the app tab is backgrounded. Requires OS notification permission on first-run.
