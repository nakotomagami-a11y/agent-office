# Reference

## Data & storage

Everything Agent Office writes to disk is under `~/.claude/`. Nothing else, nowhere else.

```
~/.claude/
├── agents/
│   ├── <agent-id>.md                  # Agent definition (frontmatter + body)
│   ├── <agent-id>.memory.md           # Optional per-agent memory
│   ├── <agent-id>.body.<ISO>.md       # Body history snapshots (max 10)
│   ├── _global.memory.md              # Global memory (applies to all agents)
│   ├── _archive/                      # Archived agents (never loaded)
│   │   └── <slug>.pre-<version>-backup.md   # Migration modal backups
│   ├── _uploads/<agent-id>/           # Per-agent file attachments
│   └── _skills/
│       ├── <skill-name>/
│       │   ├── SKILL.md
│       │   └── .source.json           # Install provenance (sha, source, ref)
│       └── _registry.json             # Registry cache (1 h TTL)
│
├── projects/
│   └── <project-id>/
│       ├── project.md                 # Roster + project memory
│       └── _uploads/                  # Per-project file attachments
│
├── agent-office/
│   ├── db.sqlite                      # All runs, messages, transcripts, pipelines
│   ├── agent-manifest-version         # Last bundled roster version applied
│   └── agent-manifest-skipped.json    # Per-version skip choices from the migration modal
│
├── .credentials.json                  # Claude auth (plan detection)
└── agent-office-settings.json         # projectsRoot, excluded, firstRunComplete
```

### Backup

```bash
sqlite3 ~/.claude/agent-office/db.sqlite \
  ".backup ~/.claude/agent-office/db.sqlite.bak"
```

## Save / export / import

Agent Office can export a project as a self-contained JSON file. This captures everything needed to restore the project on another machine — minus the SQLite run history, which stays local.

### What gets exported

| Included | Details |
|---|---|
| Project metadata | `id`, meta (name, description, cwd, roster), memory body |
| Agent definitions | Full `.md` file content + per-agent memory for each rostered agent (deduplicated) |
| Office settings | Grid layout, decorations, agent positions, grass colour from `ui_settings` |
| Conversation history | Optional — pass `?history=1` to include transcripts for all roster instances |

### What is NOT exported

The SQLite database (`db.sqlite`) is not included. Run records, token usage, and cost history stay on the originating machine.

### Export

```bash
GET /api/save/export?projectId=<id>
GET /api/save/export?projectId=<id>&history=1   # include transcripts

# Response: JSON attachment named "<project-slug>-agent-office.json"
```

### Import / restore

```bash
POST /api/save/import
Content-Type: application/json
<save file body>

# Response: { ok: true, agentCount: 3 }
```

### Cross-machine migration

1. **Export on source machine** — `GET /api/save/export?projectId=<id>&history=1` — save the JSON file.
2. **Copy to destination** — transfer the JSON file to the target machine (scp, USB, cloud storage).
3. **Import on destination** — `POST /api/save/import`. Agents, project metadata, memory files, and office layout are restored. Run the first-run wizard first if it is a fresh install.

## REST API reference

All routes are served by the Next.js backend embedded in the Tauri shell. Base URL is `http://localhost:<port>`. All request/response bodies are JSON unless noted otherwise.

### Agents

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/agents` | List all agent definitions |
| `POST` | `/api/agents` | Create agent (body: `agentBodySchema`) |
| `POST` | `/api/agents/bulk` | Bulk-create agents |
| `GET` | `/api/agents/:id` | Get agent frontmatter |
| `PUT` | `/api/agents/:id` | Update agent (backs up body first) |
| `DELETE` | `/api/agents/:id` | Delete agent file + memory sidecar |
| `GET` | `/api/agents/:id/body` | Raw markdown body (text/plain) |
| `PUT` | `/api/agents/:id/body` | Replace body; backs up to `<id>.body.<ISO>.md` |
| `GET` | `/api/agents/:id/body/history` | List body backup snapshots |
| `GET` | `/api/agents/:id/body/history/:filename` | Read one snapshot |
| `GET` | `/api/agents/:id/memory` | Per-agent memory file |
| `PUT` | `/api/agents/:id/memory` | Write per-agent memory (max 256 KB) |
| `GET` | `/api/agents/:id/prompts` | Recent prompts for agent |
| `POST` | `/api/agents/:id/prompts` | Push a recent prompt |
| `GET` | `/api/agents/:id/uploads` | List agent uploads |
| `POST` | `/api/agents/:id/uploads` | Upload file (multipart/form-data) |
| `GET` | `/api/agents/:id/uploads/:filename` | Download agent upload |

### Memory

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/memory/global` | Read global memory file |
| `PUT` | `/api/memory/global` | Write global memory (max 256 KB) |

### Runs

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/summon` | Spawn `claude` subprocess for one agent |
| `GET` | `/api/runs` | List runs (`?agent=&project=&instance=&limit=`) |
| `DELETE` | `/api/runs` | Delete all runs for an agent (`?agent=`) |
| `GET` | `/api/runs/:id` | Get single run |
| `GET` | `/api/runs/:id/stream` | SSE stream — live or replay finished |
| `POST` | `/api/runs/:id/abort` | SIGKILL the claude subprocess |
| `POST` | `/api/runs/abort-all` | Bulk-abort every in-flight run |
| `GET` | `/api/runs/:id/children` | Direct sub-agent runs (one level deep) |
| `GET` | `/api/runs/:id/tree` | Full parent→child run hierarchy |

### Projects

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects` | List project summaries |
| `POST` | `/api/projects` | Create project |
| `POST` | `/api/projects/bootstrap` | Bootstrap a project from a template |
| `GET` | `/api/projects/:id` | Get project + run stats |
| `PUT` | `/api/projects/:id` | Update project metadata |
| `DELETE` | `/api/projects/:id` | Delete project |
| `GET` | `/api/projects/:id/memory` | Project memory |
| `PUT` | `/api/projects/:id/memory` | Write project memory (max 256 KB) |
| `GET` | `/api/projects/:id/roster` | List rostered instances |
| `POST` | `/api/projects/:id/roster` | Add agent instance |
| `GET` | `/api/projects/:id/roster/:instanceId` | Get instance + USD spend |
| `PATCH` | `/api/projects/:id/roster/:instanceId` | Update instance settings |
| `DELETE` | `/api/projects/:id/roster/:instanceId` | Remove instance (cleans worktree) |
| `POST` | `/api/projects/:id/roster/:instanceId/repair-worktree` | Regenerate a broken worktree |
| `GET` | `/api/projects/:id/spend` | USD spend breakdown by instance |
| `GET` | `/api/projects/:id/git-status` | Git branch/diff/ahead/behind |
| `POST` | `/api/projects/:id/dev` | Spawn dev server in terminal |
| `POST` | `/api/projects/:id/build` | Run build script in terminal |
| `POST` | `/api/projects/:id/install` | Run package manager install |
| `POST` | `/api/projects/:id/clear-cache` | Wipe `.next/`, `dist/`, `.turbo/` |
| `POST` | `/api/projects/:id/open-folder` | `xdg-open` project directory |
| `GET` | `/api/projects/:id/uploads` | List project uploads |
| `POST` | `/api/projects/:id/uploads` | Upload file for project |

### Pipelines & broadcast

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/pipeline` | Create & start multi-agent pipeline (202) |
| `GET` | `/api/pipeline/:id` | Poll pipeline status |
| `POST` | `/api/broadcast` | Fan-out prompt to all roster instances (202) |

### Schedules

Scheduled work — manual timed tasks and rate-limit auto-resume. See [Schedules](#/schedules) for the feature guide. `fireAt` is unix **milliseconds**.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/schedules` | List all jobs → `{ jobs: [...] }` |
| `POST` | `/api/schedules` | Create a job `{ fireAt, summonRequest, reason?, label? }` → `{ job }` (201) |
| `DELETE` | `/api/schedules/:id` | Cancel a job |
| `PATCH` | `/api/schedules/:id` | Reassign target `{ agentId?, projectId?, instanceId? }` → `{ job }` |
| `POST` | `/api/schedules/:id/run` | Fire immediately, bypassing the 12h stale cap → `{ job }` |

### Processes

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/processes` | List user's listening ports (Linux only) |
| `GET` | `/api/processes/:pid` | Check process liveness |
| `DELETE` | `/api/processes/:pid` | SIGKILL process |
| `GET` | `/api/processes/:pid/logs` | Captured stdout/stderr |
| `POST` | `/api/processes/:pid/stdin` | Inject stdin (`{text}`) |

### Settings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/settings` | Read app settings |
| `PUT` | `/api/settings` | Write app settings |
| `GET` | `/api/settings/scan` | Scan filesystem for projects (`?root=&excluded=`) |
| `GET` | `/api/ui-settings` | All UI settings from SQLite |
| `PATCH` | `/api/ui-settings` | Write allowed UI settings |

### Skills

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/skills/installed` | List installed skills |
| `GET` | `/api/skills/manifest` | Flat manifest of installed skills (name, description, category, cost tier) |
| `GET` | `/api/skills/compatibility` | Skill-vs-skill conflict data (powers the warning UI) |
| `GET` | `/api/skills/icons` | Resolve icons for skills |
| `POST` | `/api/skills/install` | Install skill from GitHub |
| `GET` | `/api/skills/registry` | Fetch skill registry (`?refresh=1` to bypass cache) |
| `GET` | `/api/skills/updates` | Check installed skills for updates |
| `GET` | `/api/skills/sources` | List registry sources |
| `POST` | `/api/skills/sources` | Add / remove registry sources |
| `GET` | `/api/skills/:name` | Get single installed skill |
| `DELETE` | `/api/skills/:name` | Uninstall skill |
| `POST` | `/api/skills/:name/update` | Update skill to latest SHA |

### Workflows, prompts & drafts

> Note: "Workflows" is the current name for what used to be "saved prompts" — a curated library of reusable, multi-step prompts. The underlying SQLite table is still called `saved_prompts`, but the API and UI are `workflows`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/prompts` | Recent prompts across all agents (autocomplete history) |
| `GET` | `/api/workflows` | List workflows |
| `POST` | `/api/workflows` | Create a workflow |
| `POST` | `/api/workflows/bulk` | Bulk create / update workflows |
| `DELETE` | `/api/workflows/:id` | Delete a workflow |
| `POST` | `/api/workflows/:id/use` | Record a usage (increments the use counter) |
| `GET` | `/api/drafts` | Read drafts (per-agent, per-instance) |
| `PUT` | `/api/drafts` | Write / update a draft |
| `DELETE` | `/api/drafts` | Clear a draft |

### Transcripts & analysis

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/transcripts` | Direct transcript listing (bypasses run scoping) |
| `GET` | `/api/user-analysis` | Latest About You analysis + version history |
| `POST` | `/api/user-analysis` | Regenerate About You analysis (dispatches `user-analyst`) |

### Save / import / starter

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/save/export` | Export project save file (`?projectId=&history=1`) |
| `POST` | `/api/save/import` | Import project save file |
| `GET` | `/api/starter/agents` | List bundled starter agents |
| `POST` | `/api/starter/agents` | Import selected starter agents |
| `GET` | `/api/starter/agent-diff` | Diff bundled MANIFEST vs installed (used by migration modal) |
| `POST` | `/api/starter/agent-diff` | Apply accept / skip choices + stamp version |
| `GET` | `/api/templates` | List agent creation templates |

### Docs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/docs/content` | Docs tab config (from `_index.json`) |
| `GET` | `/api/docs/content?file=<f>` | Raw markdown body of one docs file |
| `GET` | `/api/docs/export` | Bundle all docs pages as a single export |

### Flutter integration

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/flutter/devices` | Enumerate connected Flutter devices |
| `GET` | `/api/flutter/mirror` | Live-stream a device screen (MJPEG) |
| `POST` | `/api/flutter/run` | Spawn `flutter run` in a terminal |
| `POST` | `/api/flutter/screenshot` | Capture the current device screen |

### Account & clipboard

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/account` | Read plan from `~/.claude/.credentials.json` |
| `POST` | `/api/clipboard-image` | Read clipboard PNG via `wl-paste` (Wayland only) |

### Claude accounts (multi-account)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/accounts` | List connected Claude accounts |
| `POST` | `/api/accounts` | Register a new account |
| `PATCH` | `/api/accounts/:id` | Update account (label, active flag) |
| `DELETE` | `/api/accounts/:id` | Remove an account |
| `GET` | `/api/accounts/:id/status` | Live auth/usage status for one account |
| `GET` | `/api/accounts/:id/login` | Poll an in-progress login |
| `POST` | `/api/accounts/:id/login` | Start the OAuth login flow |
| `DELETE` | `/api/accounts/:id/login` | Cancel an in-progress login |
| `POST` | `/api/accounts/:id/login/code` | Submit the OAuth authorization code |

### GitHub accounts

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/github-accounts` | List registered GitHub identities |
| `POST` | `/api/github-accounts` | Add a GitHub identity |
| `PATCH` | `/api/github-accounts/:id` | Update a GitHub identity |
| `DELETE` | `/api/github-accounts/:id` | Remove a GitHub identity |
| `GET` | `/api/github-accounts/:id/status` | Auth status for one identity |

### Analytics

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/analytics/summary` | Aggregate spend / runs / runtime for a period |
| `GET` | `/api/analytics/page` | Full analytics-page payload (trend, rankings, tools, heatmap) |
| `GET` | `/api/analytics/per-account` | Usage split by connected Claude account |

### Agent docs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/agent-docs` | List saved agent-authored docs |
| `GET` | `/api/agent-docs/:owner/:slug` | Read one agent doc |
| `PUT` | `/api/agent-docs/:owner/:slug` | Write / update an agent doc |
| `DELETE` | `/api/agent-docs/:owner/:slug` | Delete an agent doc |

### System

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Claude CLI availability check (`?force=1` to bypass cache) |
| `POST` | `/api/cleanup/:kind` | Sweep stored data by kind (e.g. reaped error runs, orphaned records) |
| `POST` | `/api/dev/seed` | (dev-only) Seed dev data |
| `POST` | `/api/dev/backfill-planets` | (dev-only) Backfill planet icons for existing projects |

## SSE event reference

All events are delivered over `GET /api/runs/:id/stream` using the SSE wire format:

```
event: <name>
data: <json>
```

| Event | Payload fields | Emitted at |
|---|---|---|
| `attached` | `runId, output, tokensIn, tokensOut, cost, status, startTs` | Immediately on subscribe — delivers current run state |
| `chunk` | `runId, text` | Each text delta and completed assistant block |
| `tool` | `runId, name, input?` | Each `tool_use` content block start |
| `usage` | `runId, tokensIn, tokensOut, cost` | Per-message usage update and final result event |
| `done` | `runId, exitCode, sessionId?, durationMs?, tokensIn?, tokensOut?, cost?` | Process exit — run finalised in SQLite |
| `error` | `runId, message` | Spawn error, rate limit, or `is_error` result |

### Replay behaviour

Events `chunk`, `tool`, and `usage` are stored in an in-memory `eventLog` and replayed to late subscribers. `done` and `error` are not stored in the eventLog — if you connect after a run finishes, `attached` delivers the final state and `done` is synthesised from the persisted record.

### Keepalive

The SSE route sends `: keepalive` every 25 seconds to prevent proxy timeouts.

### Wire format examples

```
event: attached
data: {"runId":"abc","output":"","tokensIn":0,"tokensOut":0,"cost":0,"status":"running","startTs":1716800000000}

event: chunk
data: {"runId":"abc","text":"Here is the analysis..."}

event: tool
data: {"runId":"abc","name":"Read","input":{"file_path":"/src/index.ts"}}

event: usage
data: {"runId":"abc","tokensIn":1240,"tokensOut":380,"cost":0.0042}

event: done
data: {"runId":"abc","exitCode":0,"sessionId":"sess-x","durationMs":8420}
```

## Database schema

### Pragmas

- `journal_mode=WAL` — write-ahead logging for concurrent read+write
- `synchronous=NORMAL` — durability at fsync boundaries
- `foreign_keys=ON`

### `runs`

Every summon creates one row. Never mutated except at `done` (append output, set exit_code, timestamps).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `agent_id` | TEXT | Foreign key not enforced (agents are files, not rows) |
| `agent_name` | TEXT | Display name at run time |
| `instance_id` | TEXT | Defaults to `"default"` |
| `instance_label` | TEXT | Optional |
| `project_id` | TEXT | Nullable — orphan runs allowed |
| `session_id` | TEXT | Claude CLI session for `--resume` |
| `status` | TEXT | `running` · `done` · `error` |
| `exit_code` | INT | Process exit code |
| `prompt` | TEXT | Original prompt |
| `output` | TEXT | Streamed assistant output |
| `tokens_in`, `tokens_out` | INT | Cumulative |
| `cost_usd` | REAL | Cumulative |
| `dur_ms` | INT | Wall-clock duration |
| `model`, `effort` | TEXT | At run time |
| `cwd` | TEXT | Working directory |
| `started_at`, `ended_at` | INT | Unix milliseconds |
| `parent_run_id` | TEXT | Set for sub-agent runs |
| `rate_limited_resets_at` | INT | Unix **seconds**; set only when a run hit a hard limit. Lets the scheduler detect a repeat rate-limit on a resume (migration v12) |

### `scheduled_jobs`

One row per scheduled job (manual task or rate-limit resume). Added in migration v12. See [Schedules](#/schedules).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `fire_at` | INT | Unix **milliseconds** — job fires on the first tick at/after this |
| `summon_request` | TEXT | JSON-serialized `SummonRequest` (agent, prompt, project, resume session…) |
| `reason` | TEXT | `manual` · `rate-limit` (default `manual`) |
| `label` | TEXT | Human label for the list |
| `status` | TEXT | `pending` · `firing` · `done` · `cancelled` · `needs-attention` |
| `attention` | TEXT | `stale` · `missing-instance` · `retry-exceeded` (only when `needs-attention`) |
| `attempts` | INT | Consecutive rate-limit re-schedules (ceiling 5) |
| `fired_run_id` | TEXT | Run started by the most recent fire |
| `created_at`, `updated_at` | INT | Unix milliseconds |

Indexed by `(status, fire_at)` for the scheduler's due-job scan.

### `messages`

Chat-format history. One row per assistant / user message. Full-text-indexed via `messages_fts`.

### `pipelines` & `pipeline_steps`

Pipeline definitions and per-step state.

### Other tables

- `tool_calls` — one row per tool_use content block
- `transcripts` — per-`tKey` (`<agentId>::<instanceId>`) chat state row: full thread items, `active_run_id`, `session_id`, `queued_messages` (JSON array of pending sends, DEFAULT `'[]'` per migration v6), `updated_at`. Written through by every chat state change so a hard refresh or app restart restores the conversation exactly.
- `saved_prompts` — workflow templates with usage counter (table name predates the "Workflows" rename; exposed via `/api/workflows`)
- `drafts` — chat draft persistence
- `ui_settings` — key-value store for UI state (see the allow-list below)
- `recent_prompts` — deduplicated prompt history for autocomplete

### Virtual table

- `messages_fts` — FTS5 virtual table synced with `messages` via triggers

### Migrations

Run automatically at server start via `services/db.ts`. Idempotent — safe to run against an already-migrated DB.

### Crash recovery

On boot, any `runs` row with `status='running'` and no matching in-memory process is marked `status='error'` with `exit_code=-1`. Preserves partial output. (Reaped rows can later be swept by `POST /api/cleanup/:kind`, which deletes error runs with `exit_code=-1`.)

### Direct queries

```bash
sqlite3 -header -column ~/.claude/agent-office/db.sqlite "
  SELECT agent_id, COUNT(*) AS runs, SUM(cost_usd) AS cost
  FROM runs GROUP BY agent_id ORDER BY cost DESC LIMIT 10;
"
```

## Architecture — build & run

### Stack

- **Frontend** — Next.js 15 (App Router), React 19, Tailwind v4
- **Backend** — Next.js API routes, embedded in Tauri via `next start`
- **Desktop shell** — Tauri v2 (Rust + WebView)
- **Data** — SQLite (better-sqlite3), plain Markdown files under `~/.claude/`
- **Streaming** — Server-Sent Events for run output, WebSocket-adjacent for Flutter mirror

### Run lifecycle

```
Human prompt
  ↓
POST /api/summon
  ↓
  ├─ Compose system prompt (skills + memory + context)
  ├─ Fork `claude` subprocess with --system-prompt, --allowedTools, etc.
  ├─ Write run row (status=running)
  ↓
Subprocess stdout
  ↓
  Parse each JSON line
  ├─ chunk → emit SSE event + append to output
  ├─ tool  → emit SSE event + insert tool_call
  ├─ usage → emit SSE event + update tokens/cost
  ↓
Subprocess exit
  ↓
  Finalize run (status=done or error, ended_at, dur_ms)
  Emit SSE `done` event
```

### Claude CLI flags

Every summon call assembles flags from the agent frontmatter:

| Flag | Source |
|---|---|
| `--model <alias>` | `default-model` |
| `--allowedTools ...` | `tools[]` |
| `--effort <level>` | `default-effort` |
| `--system-prompt @/tmp/...` | Composed body written to temp file |
| `--append-system-prompt @/tmp/...` | Skills + memory + history note |
| `--add-dir <path>` | Each entry in `add-dirs[]` |
| `--permission-mode <mode>` | `permission-mode` |
| `--session-id <id>` | If continuing an existing conversation |
| `--resume` | Set when session-id is present |

### Environment variables

| Var | Purpose |
|---|---|
| `AGENT_OFFICE_STARTER_DATA` | Override the starter-data directory path (default: `apps/web/starter-data`) |
| `AGENT_OFFICE_DOCS_DIR` | Override the docs source directory (default: `apps/web/docs`) |
| `AGENT_OFFICE_DB_PATH` | Override SQLite path (default: `~/.claude/agent-office/db.sqlite`) |
| `ANTHROPIC_API_KEY` | Passed to the `claude` subprocess |
| `AO_DEBUG_TOOLS` | When set (any value), enables verbose tool-call logging in the summon subprocess wrapper. Dev-only. |
| `DEFAULT_LOCALE` | Override the i18n default locale (defaults to `en`). Used by `next-intl`. |
| `NODE_ENV` | Standard Node env — `development` / `production`. |
| `NEXT_RUNTIME` | Internal Next.js signal (`nodejs` vs `edge`). Not user-settable. |

### PATH augmentation

The Next.js server augments its `PATH` with common install locations (`~/.nvm/versions/*/bin`, `~/.bun/bin`, `/opt/homebrew/bin`) so `claude`, `node`, and `pnpm` resolve regardless of how the app was launched.

### `ui_settings` allow-list

`PATCH /api/ui-settings` refuses any key not on the allow-list. Every key stores a string value up to **10 KB**.

**Static keys** (single global values):

| Key | Purpose |
|---|---|
| `theme` | `"light"` \| `"dark"` — active color scheme. |
| `active-project` | Slug of the currently-selected project. |
| `tabs-state` | JSON blob: `{ tabs: Tab[], activeTabId: string \| null, closedStack: Tab[] }` — open project tabs, active tab, and LRU stack of the 10 most-recently closed tabs (for `Ctrl+Shift+T` restore). Persists Chrome-style tab UX across app restarts. |
| `claude-limits` | JSON blob for spend-cap configuration. |
| `performance-mode` | `"full"` \| `"lite"` \| `"off"` — rendering / animation budget. |
| `office-grid` | Global office grid dimensions fallback. |
| `office-decorations` | Global decoration placements fallback. |
| `office-agents` | Global agent positions fallback. |
| `office-grass-color` | Global floor color fallback. |

**Dynamic key prefixes** (each followed by a project id, e.g. `office-grid:acme-web`):

| Prefix | Purpose |
|---|---|
| `office-grid:` | Grid dimensions for one project's office. |
| `office-decorations:` | Decoration placements. |
| `office-agents:` | Agent positions on the floor. |
| `office-grass-color:` | Floor color. |
| `office-map-custom:` | `"true"` \| `"false"` — whether the map was hand-edited. |

Any other key returns `400 forbidden_key`.

### App settings (`~/.claude/agent-office-settings.json`)

Persisted at `~/.claude/agent-office-settings.json`. Read/write via `GET/PUT /api/settings`.

| Field | Type | Description |
|---|---|---|
| `projectsRoot` | string | Parent dir to scan for candidate projects |
| `excluded` | string[] | Directory names to skip during scan |
| `firstRunComplete` | boolean | Set to `true` when the first-run wizard finishes |
| `features.multiInstance` | boolean? | Optional feature flag — enable multi-instance workflow |

### Zustand stores

Client-only state stores (persisted where noted):

| Store | Persistence | What it tracks |
|---|---|---|
| `use-office-store` | `zustand/persist` → localStorage | View mode (`iso` \| `cards`), selected agent/instance, inspector-open state, pending-tab, group expansion state |
| `use-summon-store` | in-memory | Per-instance chat state — message queue, streaming buffers |
| `active-project-store` | server via `ui_settings.active-project` | Currently-active project slug — mirrored from the active tab by `tabs-router-sync` |
| `tabs-store` | server via `ui_settings.tabs-state` | Open project tabs, active tab, closed-tab LRU stack (Chrome-style shell) |
| `chat-state-registry` | in-memory (per-`tKey`) | Preserves thread, active run id, session id, queued messages, composer seed, phase override, context profile, transcript-loaded flag, run splice index — so switching project tabs doesn't wipe the conversation. Cold-loaded from the `transcripts` table on first mount. |
| `run-stream-registry` | in-memory (per run id) | Keeps SSE `EventSource` connections alive across component unmount so runs streaming in a tab you left don't drop tokens. |
| `theme-store` | server via `ui_settings.theme` | `light` \| `dark` |
| `performance-store` | server via `ui_settings.performance-mode` | `full` \| `lite` \| `off` |
| `claude-limits-store` | server via `ui_settings.claude-limits` | Spend-cap config |
| `compare-store` | localStorage | Runs selected for compare across route transitions |
| `palette-store` | in-memory | Command palette open state + last query |
| `flutter-store` | in-memory | Flutter mirror connection |
| `dev-server-store` | in-memory | Dev server states per project |
| `server-process-store` | in-memory | General process tracking |
| `branch-store` | in-memory | Cached git branch per project |
| `draft-store` | server via `/api/drafts` | Composer drafts (per agent + instance) |
| `transcript-store` | in-memory | Current transcript playback state |
| `processes-store` | in-memory | Processes panel snapshot |

### Dev-only tools

The Dev menu (bundled but hidden by default) exposes DB stats, bulk seed, and cache clear from a single modal. Trigger via a hidden button in the titlebar under development builds. Not available in production builds.

### Reduced motion

A partial `@media (prefers-reduced-motion: reduce)` block in `globals.css` short-circuits several long CSS animations (pulse, shimmer, chat-jump-latest, cursor blink). The Performance mode setting extends this coverage.

### Dev mode

- `pnpm dev` runs Next dev server on `:3000`
- `pnpm tauri:dev` starts the desktop shell wrapping the dev server
- Hot module reload works for React, API routes, and docs `.md` files (via `no-cache` on the docs content route)

### `--resume` retry behaviour

If a `claude` subprocess exits with `is_error: true` on the first message of a resume, Agent Office retries once WITHOUT `--resume` to break session-corruption loops. If the second attempt also errors, the run is failed.
