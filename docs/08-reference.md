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
│   ├── db.sqlite                      # Runs, messages, conversations, schedules
│   ├── agent-manifest-version         # Last bundled roster version applied
│   └── agent-manifest-skipped.json    # Per-version skip choices from the migration modal
│
├── .credentials.json                  # Claude auth (plan detection)
└── agent-office-settings.json         # projectsRoot, excluded, firstRunComplete, integrations
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

### What is NOT exported

The SQLite database (`db.sqlite`) is not included. Conversations, run records, token usage, and cost history stay on the originating machine. A save file from an older version that carries `history` still imports; the history is ignored.

### Export

```bash
GET /api/save/export?projectId=<id>

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

1. **Export on source machine** — `GET /api/save/export?projectId=<id>` — save the JSON file.
2. **Copy to destination** — transfer the JSON file to the target machine (scp, USB, cloud storage).
3. **Import on destination** — `POST /api/save/import`. Agents, project metadata and memory files are restored. Run the first-run wizard first if it is a fresh install.

## REST API reference

All routes are served by the Next.js backend embedded in the Tauri shell. Base URL is `http://localhost:<port>`. All request/response bodies are JSON unless noted otherwise.

### Agents

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/agents` | List all agent definitions |
| `POST` | `/api/agents` | Create agent (body: `agentBodySchema`) |
| `GET` | `/api/agents/:id` | Get agent frontmatter |
| `PUT` | `/api/agents/:id` | Update an existing agent (404 if missing); only the keys sent change; a changed body is snapshotted |
| `DELETE` | `/api/agents/:id` | Delete agent and its sessions (`?work=keep` or `discard`); its files are copied to `backups/agents/` first |
| `GET` | `/api/agents/:id/body` | Raw markdown body (text/plain) |
| `GET` | `/api/agents/:id/memory` | Per-agent memory file |
| `PUT` | `/api/agents/:id/memory` | Write per-agent memory (max 256 KB) |
| `GET` | `/api/agents/:id/prompts` | Recent prompts for agent |
| `GET` | `/api/agents/:id/uploads` | List agent uploads |
| `POST` | `/api/agents/:id/uploads` | Upload file (multipart/form-data) |
| `GET` | `/api/agents/:id/uploads/:filename` | Download agent upload |
| `GET` | `/api/agents/:id/context-cost` | Context & Cost breakdown: per-segment token estimate + native overhead + cost/week, for an instance (`?instanceId=&projectId=`). `no-store` — always fresh |
| `POST` | `/api/agents/:id/context-cost/measure` | "Measure exactly" — spawns one real, throwaway probe session (~10-15s) to replace the native-overhead estimate with a measured split (CC base+tools vs. MCP schemas). Body: `{ instanceId?, projectId? }` |

### Memory

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/memory/global` | Read global memory file |
| `PUT` | `/api/memory/global` | Write global memory (max 256 KB) |

### Runs endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/summon` | Spawn `claude` subprocess for one agent |
| `GET` | `/api/runs` | List runs (`?agent=&project=&instance=&limit=`) |
| `GET` | `/api/runs/:id` | Get single run |
| `GET` | `/api/runs/:id/stream` | SSE stream — live or replay finished |
| `POST` | `/api/runs/:id/abort` | SIGKILL the claude subprocess |
| `GET` | `/api/runs/:id/tree` | Full parent→child run hierarchy |
| `POST` | `/api/runs/:id/permission` | From the MCP permission bridge: park a tool call until the user answers |
| `PATCH` | `/api/runs/:id/permission` | From the chat: answer a parked request |
| `GET` | `/api/runs/:id/permission` | Requests still parked for this run (recovery after a reload) |
| `GET` | `/api/events` | App-wide SSE stream of coarse domain events (see "App-wide events" below) |

### Projects

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects` | List project summaries |
| `POST` | `/api/projects` | Create project |
| `POST` | `/api/projects/bootstrap` | Bootstrap a project from a template |
| `GET` | `/api/projects/:id` | Get project + run stats |
| `PUT` | `/api/projects/:id` | Update project metadata |
| `DELETE` | `/api/projects/:id` | Delete project |
| `DELETE` | `/api/projects/:id/folder` | Delete the project's folder from disk and its metadata (`?path=` must be the folder the id names under the projects root) |
| `GET` | `/api/projects/:id/memory` | Project memory |
| `PUT` | `/api/projects/:id/memory` | Write project memory (max 256 KB) |
| `POST` | `/api/projects/:id/roster` | Add agent instance (typed 409 at the instance cap) |
| `DELETE` | `/api/projects/:id/roster` | Remove every instance (reset; `?work=keep\|discard`) |
| `GET` | `/api/projects/:id/roster/:instanceId` | Get instance + USD spend |
| `PATCH` | `/api/projects/:id/roster/:instanceId` | Update instance settings |
| `DELETE` | `/api/projects/:id/roster/:instanceId` | Remove instance (cleans worktree; `?work=keep\|discard`, `&conversation=delete` also deletes its conversation) |
| `POST` | `/api/projects/:id/roster/:instanceId/repair-worktree` | Regenerate a broken worktree |
| `GET` | `/api/projects/:id/spend` | USD spend breakdown by instance |
| `GET` | `/api/projects/:id/git-status` | Git branch/diff/ahead/behind |
| `GET` | `/api/projects/:id/dev` | Detected dev commands |
| `POST` | `/api/projects/:id/dev` | Spawn dev server in terminal |
| `GET` | `/api/projects/:id/build` | Whether a build command is detectable |
| `POST` | `/api/projects/:id/build` | Run build script in terminal |
| `POST` | `/api/projects/:id/install` | Run package manager install |
| `POST` | `/api/projects/:id/clear-cache` | Wipe `.next/`, `dist/`, `.turbo/` |
| `POST` | `/api/projects/:id/open-folder` | Open project directory in the OS file manager, or VS Code with `?app=code` |
| `GET` | `/api/projects/:id/uploads` | List project uploads |
| `POST` | `/api/projects/:id/uploads` | Upload file for project |
| `GET` | `/api/projects/:id/uploads/:filename` | Download project upload |

### Conversations

Server-authoritative chat threads, one per (agent, instance) slot — see `docs/chat-refactor.md`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/conversations?agentId=&instanceId=` | The slot's current conversation, or null |
| `POST` | `/api/conversations` | Get or create the slot's current conversation `{ agentId, instanceId?, projectId? }` |
| `POST` | `/api/conversations/:id/messages` | Send a message `{ text }`: starts a turn when idle, queues it otherwise |
| `POST` | `/api/conversations/:id/new` | New thread for the same slot, with a fresh session; the old one is kept |
| `POST` | `/api/conversations/:id/resume` | `needs_attention`: continue the session as a new turn |
| `POST` | `/api/conversations/:id/retry` | `needs_attention`: re-run the prompt that failed |
| `POST` | `/api/conversations/:id/skip` | `needs_attention`: drop the failed turn and move to the next queued message |
| `DELETE` | `/api/conversations/:id/queue` | Clear the pending queue |
| `DELETE` | `/api/conversations/:id/queue/:messageId` | Remove one queued message |

### Loops

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/loops?projectId=&instanceId=` | That seat's latest loop, or null |
| `POST` | `/api/loops` | Start a loop; its ceilings are validated here |
| `GET` | `/api/loops/:id` | Current state (reconciles a stale active run first) |
| `PATCH` | `/api/loops/:id` | The user's interventions |

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
| `GET` | `/api/processes` | List user's listening ports (Linux, macOS, Windows) and agent background shells |
| `GET` | `/api/processes/:pid` | Check process liveness |
| `DELETE` | `/api/processes/:pid` | SIGKILL process the user owns (on Windows/macOS checked first; `503 ownership_unverified` if the check cannot run) |

### Settings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/settings` | Read app settings |
| `PUT` | `/api/settings` | Replace the core app settings |
| `PATCH` | `/api/settings` | Merge a partial update |
| `GET` | `/api/settings/scan` | Scan filesystem for projects (`?root=&excluded=`) |
| `GET` | `/api/ui-settings` | All UI settings from SQLite |
| `PATCH` | `/api/ui-settings` | Write allowed UI settings |

### Skills

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/skills/installed` | List installed skills |
| `GET` | `/api/skills/manifest` | Flat manifest of installed skills (name, description, category, cost tier) |
| `GET` | `/api/skills/icons` | Resolve icons for skills |
| `POST` | `/api/skills/icons` | Set a skill's icon |
| `POST` | `/api/skills/install` | Install skill from GitHub |
| `POST` | `/api/skills/create` | Forge, edit or fork a local skill |
| `POST` | `/api/skills/import` | Import a skill from pasted `SKILL.md` text |
| `GET` | `/api/skills/registry` | Fetch skill registry (`?refresh=1` to bypass cache) |
| `GET` | `/api/skills/updates` | Check installed skills for updates |
| `GET` | `/api/skills/sources` | List registry sources |
| `POST` | `/api/skills/sources` | Add a registry source |
| `DELETE` | `/api/skills/sources` | Remove a registry source (`?source=&ref=`) |
| `GET` | `/api/skills/:name` | Get single installed skill |
| `DELETE` | `/api/skills/:name` | Uninstall skill |
| `POST` | `/api/skills/:name/update` | Update skill to latest SHA |
| `GET` | `/api/skills/:name/customization` | The skill's `##` sections and which are switched off |
| `PUT` | `/api/skills/:name/customization` | Replace the switched-off set (applies wherever the skill is used) |

### Missions

Agents on several devices coordinating through a GitHub draft PR — see `docs/missions.md`. Every route but `seat` runs `gh`, and refuses requests another site made. Errors are `{ error, hint, detail? }`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/missions?projectId=` | Open mission hubs in a project, with each seat's state and the manifest hash a claim must send |
| `POST` | `/api/missions` | Start a mission: opens the draft hub and seats this device as coordinator |
| `POST` | `/api/missions/claim` | Claim a seat from this device (`manifestHash` must match what the human saw) |
| `GET` | `/api/missions/seat?instanceId=` | Which mission seat a chat is (local, no `gh`) |
| `GET` | `/api/missions/:id` | The mission as this device sees it, folded fresh from the hub |
| `POST` | `/api/missions/:id/claims/:commentId` | Lead only: accept or reject a claim |
| `POST` | `/api/missions/:id/asks/:commentId` | Answer a seat's question, or (lead) rule on a decision request |
| `POST` | `/api/missions/:id/act` | Lead only: pause, resume, close, or evict a seat whose device is gone |
| `POST` | `/api/missions/:id/leave` | Give up a seat this device holds |
| `POST` | `/api/missions/:id/cap` | Raise this device's spend cap for a seat |

### Drafts

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/drafts` | Read drafts (per-agent, per-instance) |
| `PUT` | `/api/drafts` | Write / update a draft |

### Save / import / starter

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/save/export` | Export project save file (`?projectId=`) |
| `POST` | `/api/save/import` | Import project save file |
| `GET` | `/api/starter/agents` | List bundled starter agents |
| `POST` | `/api/starter/agents` | Import selected starter agents |
| `GET` | `/api/starter/agent-diff` | Diff bundled MANIFEST vs installed (used by migration modal) |
| `POST` | `/api/starter/agent-diff` | Apply accept / skip choices + stamp version |

### Docs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/docs/content` | Docs tab config (from `_index.json`) |
| `GET` | `/api/docs/content?file=<f>` | Raw markdown body of one docs file |

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
| `GET` | `/api/accounts/:id/status` | Live auth/usage status for one account. For `default` it first inserts the account's row if missing (idempotent), so a fresh machine can sign in to it |
| `GET` | `/api/accounts/:id/login` | Poll an in-progress login |
| `POST` | `/api/accounts/:id/login` | Start the OAuth login flow |
| `DELETE` | `/api/accounts/:id/login` | Cancel an in-progress login |
| `POST` | `/api/accounts/:id/login/code` | Submit the OAuth authorization code |

### AI providers

Agents run on the one provider chosen here: `subscription`, `anthropic_api`, `openai` or `local`. No route ever returns a key, only its last four characters (`keyHint`).

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/providers` | The choice, whether setup is needed, the CLI's state, and every provider's config, status and capabilities. No network call: status is the last probe, kept 60 s |
| `PUT` | `/api/providers/selected` | Choose the provider `{provider, acceptUnavailable?}`. 409 `provider_not_ready` with the reason when it cannot run |
| `PUT` | `/api/providers/:id` | Save `{baseUrl?, apiKey?, models?}`. A new base URL clears the stored key unless the same request carries one |
| `DELETE` | `/api/providers/:id/key` | Forget the stored key |
| `POST` | `/api/providers/:id/test` | Probe the provider (stored config, or a `draft`) |
| `GET` | `/api/model-prices` | `{source, fetchedAt, stale, fetchEnabled, entries}`: per-model USD per million tokens from the auto-updated catalog |
| `POST` | `/api/model-prices/refresh` | Re-fetch the catalog now. 429 within a minute of the last attempt, 409 `price_fetch_disabled` when fetching is off, 502 when both sources failed |
| `PUT` | `/api/model-prices/settings` | `{fetchEnabled}`: turn outbound price fetches off or on. Off: every price is unknown |
| `POST` | `/api/gateway/v1/messages` | The agents' gateway for every provider but `subscription`. Accepts only a running agent's per-run token; no UI calls it |
| `POST` | `/api/gateway/v1/messages/count_tokens` | Always 404, so the CLI counts locally |

### Secrets

Named environment variables injected into runs of the projects they are attached to. Values are encrypted at rest and never returned.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/secrets` | List secrets (no values) |
| `POST` | `/api/secrets` | Create a secret |
| `PATCH` | `/api/secrets/:id` | Update a secret |
| `DELETE` | `/api/secrets/:id` | Delete a secret |
| `POST` | `/api/secrets/:id/test` | Run its test command with the secret in env (`{ skipped: true }` without one) |
| `POST` | `/api/secrets/test` | Run an unsaved form's test command (`{ name, value?, testCmd, id? }`; a blank value uses the stored one of `id`); nothing is persisted |
| `GET` | `/api/projects/:id/secrets` | Secrets attached to a project (no values) |
| `POST` | `/api/projects/:id/secrets` | Attach a secret to a project (idempotent) |
| `DELETE` | `/api/projects/:id/secrets/:secretId` | Detach it; the secret stays for other projects |

### Pull-request review (the Review Lectern)

Runs `gh` as the project's GitHub identity — see `docs/minecraft-review-lectern.md`. Errors are `{ error, hint, detail? }`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects/:id/reviews` | The project's open pull requests |
| `GET` | `/api/projects/:id/reviews/:number` | One PR: parsed diff, checks, notes, and the seat its feedback goes to |
| `POST` | `/api/projects/:id/reviews/:number/review` | Submit one review (verdict, body, line comments) and tell the agent |
| `POST` | `/api/projects/:id/reviews/:number/merge` | Squash-merge the reviewed head (checks must be green) |
| `POST` | `/api/projects/:id/reviews/:number/reject` | Close the PR unmerged (branch kept) with a reason |
| `PUT` | `/api/projects/:id/reviews/:number/link` | Pick the roster seat that gets this PR's feedback |

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
| `GET` | `/api/analytics/page` | Full analytics-page payload (trend, rankings, tools, heatmap); `totals.unknownCostRuns` as above |
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
| `GET` | `/api/power` | Is the machine on AC or battery (`{ onAc: null }` where the OS exposes no power supply) |
| `GET` | `/api/generated-images?name=&since=` | Which images of one `imggen` job exist so far |
| `GET` | `/api/generated-images/:date/:filename` | Serve one image `imggen` wrote |
| `GET` | `/api/dev/seed` | (dev-only) Seed status |
| `POST` | `/api/dev/seed` | (dev-only) Seed the showcase world or run db maintenance |
| `GET` | `/api/dev/loop-ids` | (dev-only) Ids of recorded loops, for the `/dev/loop` harness |
| `GET` | `/api/dev/planet-gallery` | (dev-only) The planet gallery's working set |
| `PUT` | `/api/dev/planet-gallery` | (dev-only) Save it |

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
| `tool` | `runId, name, input?, toolUseId?, ts?` | Each `tool_use` content block start |
| `tool-done` | `runId, toolUseId, ts, backgrounded?` | That call's result arrived, or its run ended without one |
| `usage` | `runId, tokensIn, tokensOut, cost` | Per-message usage update and final result event |
| `done` | `runId, exitCode, sessionId?, durationMs?, tokensIn?, tokensOut?, cost?` | Process exit — run finalised in SQLite |
| `error` | `runId, code, detail?, interrupted?, remediation` | Spawn error or `is_error` result. `code` is a `RunErrorCode`; `remediation` is the agent-facing fix for it |

### Replay behaviour

Events `chunk`, `tool`, `tool-done` and `usage` are stored in an in-memory `eventLog` and replayed to late subscribers. `done` and `error` are not stored in the eventLog — if you connect after a run finishes, `attached` delivers the final state and `done` is synthesised from the persisted record.

### Keepalive

The SSE route sends `: keepalive` every 25 seconds to prevent proxy timeouts.

### App-wide events — `GET /api/events`

A separate SSE stream, one per browser tab, for coarse domain events unrelated to any single run's output:

| Event | When emitted |
|---|---|
| `runs:changed` | A run started or finished |
| `spend:changed` | A run finished (its cost is now reflected in spend totals) |
| `conversations:changed` | A conversation transitioned state (queued a message, started a run, hit `needs_attention`, etc.) |
| `schedules:changed` | The scheduler created, fired, or updated a job |

The client maps each event type to a React Query `invalidateQueries` call by key prefix (`app/app-events.tsx`), replacing most `refetchInterval` polling for runs/spend/conversations/schedules with instant, push-driven refresh. Polling still runs on those queries as a slow (60s, `NEXT_PUBLIC_POLL_SAFETY_NET`) reconnect safety net. External-world state (OAuth login, credential-file appearance, OS process liveness) is **not** on this channel — those still poll on their own short, purpose-specific intervals, since the server can only learn about them by polling too.

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
| `cost_usd` | REAL | Cumulative. What it means is `cost_basis` |
| `provider` | TEXT | The AI provider the run used. NULL (older rows): `subscription` |
| `cost_basis` | TEXT | `notional` (subscription: the list price of the tokens, not a bill), `billed` (Anthropic API key), `estimated` (OpenAI: usage × the price catalog), `unknown` (an OpenAI model with no price; `cost_usd` is 0 and totals count the run in `unknownCostRuns` instead) or `free` (local). NULL (older rows): `notional` |
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

### Other tables

- `tool_calls` — one row per tool_use content block
- `conversations` — server-authoritative conversation state: `id`, `agent_id`, `instance_id`, `project_id`, `session_id`, `status` (`idle`\|`running`\|`needs_attention`), `active_run_id`, `created_at`, `updated_at`. `runs.conversation_id` links a run to its conversation. See `docs/chat-refactor.md`. It replaced the legacy `transcripts` table; v31 emptied that and the unused `pipelines`/`pipeline_steps`, after copying any rows to `~/.claude/agent-office/backups/`. The empty tables stay until no installed build reads them.
- `queued_messages` — messages typed while a run is in flight: `id`, `conversation_id` (FK), `text`, `attachments`, `position`, `created_at` — dispatched in order once the run finishes.
- `background_shells` — a `run_in_background` Bash shell an agent spawned: `id`, `run_id` (FK), agent/instance/project fields, `pid`, `command`, `description`, `started_at`.
- `agent_context_measurements` — agent-scoped (PK `agent_id`) result of the Context & Cost tab's "Measure exactly" probe: `cc_base_and_tools_tokens`, `mcp_tokens`, `mcp_server_names`, `measured_at`.
- `mission_seats` — the mission seats this device holds: chat, hub branch, pinned lead + manifest, cursor, spend cap. The mission itself lives on GitHub (`docs/missions.md`).
- `mission_posts` — every hub comment this device posted (nonce first, comment id after), so forgeries of it are caught.
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
- **Streaming** — Server-Sent Events for run output

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

`buildClaudeArgs` (`packages/domain/src/services/execution/summon.ts`) assembles the real argv in a fixed order — see architecture.md's "CLI argv order" for the full authoritative table. Summary:

| Flag | Source |
|---|---|
| `-p --agent <id> --output-format stream-json --include-partial-messages --verbose` | Always present, hardcoded |
| `--model <alias>` | `default-model`, omitted if `"default"` |
| `--effort <level>` | `default-effort`, omitted if `"default"` |
| `--max-budget-usd <n>` | `request.maxBudgetUsd`, omitted if ≤ 0 |
| `--permission-mode <mode>` | `permission-mode` |
| `--add-dir <path>` | One flag per entry in `add-dirs[]` (tilde-expanded) |
| `--append-system-prompt-file <path>` | The composed appended prompt (skills, identity, response style, memory tiers, history note — see `docs/03-agents.md`), written to a temp file to sidestep `execve` arg-length limits, not passed inline |
| `--resume <sessionId>` | Present when continuing an existing conversation |
| *(final positional arg)* | Prior-context text (if any) + the prompt |

### Environment variables

| Var | Purpose |
|---|---|
| `AGENT_OFFICE_STARTER_DATA` | Override the starter-data directory path (default: `apps/web/starter-data`) |
| `AGENT_OFFICE_DOCS_DIR` | Override the docs source directory (default: the repo's `docs/`) |
| `ANTHROPIC_API_KEY` | Not used. Every `ANTHROPIC_*` and `CLAUDE_CODE_OAUTH_*` variable (a `claude setup-token` login included) is removed from agent runs; save an API key in Settings → AI provider instead |
| `AO_DEBUG_TOOLS` | When set (any value), enables verbose tool-call logging in the summon subprocess wrapper. Dev-only. |
| `DEFAULT_LOCALE` | Override the i18n default locale (defaults to `en`). Used by `next-intl`. |
| `NODE_ENV` | Standard Node env — `development` / `production`. |
| `NEXT_RUNTIME` | Internal Next.js signal (`nodejs` vs `edge`). Not user-settable. |

> [!NOTE]
> Polling-interval vars (`NEXT_PUBLIC_POLL_*`) are covered in `docs/architecture.md`'s Environment variables table, next to the SSE/`/api/events` section they relate to — not repeated here to avoid a second copy of the same list drifting from the first.

### PATH augmentation

The Next.js server augments its `PATH` with common install locations (`~/.nvm/versions/*/bin`, `~/.bun/bin`, `/opt/homebrew/bin`) so `claude`, `node`, and `pnpm` resolve regardless of how the app was launched.

### `ui_settings` allow-list

`PATCH /api/ui-settings` refuses any key not on the allow-list. Every key stores a string value up to **2 MB**.

| Key | Purpose |
|---|---|
| `theme` | `"light"` \| `"dark"` — active color scheme. |
| `active-project` | Slug of the currently-selected project. |
| `tabs-state` | JSON blob: `{ tabs: Tab[], activeTabId: string \| null, closedStack: Tab[] }` — open project tabs, active tab, and LRU stack of the 10 most-recently closed tabs (for `Ctrl+Shift+T` restore). Persists Chrome-style tab UX across app restarts. |
| `claude-limits` | JSON blob for spend-cap configuration. |
| `performance-mode` | `"full"` \| `"lite"` \| `"off"` — rendering / animation budget. |
| `performance-auto` | `"true"` \| `"false"` — follow the power source (full on AC, lite on battery). |
| `agent-office:wizard-draft` | JSON draft of a partly-filled first-run wizard. |
| `roster-groups` | JSON blob: `{ expandedGroups, pinnedGroups }`, each keyed by project id — expanded and pinned roster groups. |

Any other key returns `400 forbidden_key`.

### App settings (`~/.claude/agent-office-settings.json`)

Persisted at `~/.claude/agent-office-settings.json`. `GET /api/settings` reads it. `PUT` replaces `projectsRoot` and `excluded` and keeps every other field. `PATCH` merges `features`, `integrations` and `firstRunComplete`; fields a patch leaves out keep their stored value.

| Field | Type | Description |
|---|---|---|
| `projectsRoot` | string | Parent dir to scan for candidate projects |
| `excluded` | string[] | Directory names to skip during scan |
| `firstRunComplete` | boolean | Set to `true` when the first-run wizard finishes |
| `features.multiInstance` | boolean? | Optional feature flag — enable multi-instance workflow |
| `integrations` | Record<string, boolean>? | Per-integration toggle; absent key = registry default |

### Zustand stores

Client-only state stores (persisted where noted):

| Store | Persistence | What it tracks |
|---|---|---|
| `use-office-store` | server via `ui_settings.roster-groups` (groups only) | Selected agent/instance, inspector-open state, pending-tab, expanded and pinned roster groups |
| `use-summon-store` | in-memory | Per-instance chat state — message queue, streaming buffers |
| `active-project-store` | server via `ui_settings.active-project` | Currently-active project slug — mirrored from the active tab by `tabs-router-sync` |
| `tabs-store` | server via `ui_settings.tabs-state` | Open project tabs, active tab, closed-tab LRU stack (Chrome-style shell) |
| `run-stream-registry` | in-memory (per run id) | Keeps SSE `EventSource` connections alive across component unmount so runs streaming in a tab you left don't drop tokens. |
| `theme-store` | server via `ui_settings.theme` | `light` \| `dark` |
| `performance-store` | server via `ui_settings.performance-mode` | `full` \| `lite` \| `off` |
| `claude-limits-store` | server via `ui_settings.claude-limits` | Spend-cap config |
| `dev-server-store` | in-memory | Dev server states per project |
| `branch-store` | in-memory | Cached git branch per project |
| `draft-store` | server via `/api/drafts` | Composer drafts (per agent + instance) |
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
