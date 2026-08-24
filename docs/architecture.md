# Agent Office — Architecture

> Technical deep-dive. Source of truth: the code in this repo.

---

## Monorepo packages

| Package | Description |
|---------|-------------|
| `apps/web` | Next.js app — UI, API routes, SSE runner. Design-system primitives live in `src/components/ui/` |
| `packages/domain` | `@agent-office/domain` — types, DB layer, services, route config |
| `packages/pixel-planets` | `@agent-office/pixel-planets` — WebGL2 procedural pixel-art planet renderer; one shared GL context for N planets; 11 planet types; deterministic from integer seed |
| `packages/pixel-icons` | `@agent-office/pixel-icons` — procedural pixel-art icon set (agent avatars, weapons, tools) |

---

## Process model

Agent Office is a **single-process Next.js app**. There is no separate backend server. API routes (`apps/web/src/app/api/`) run in the same Node.js process. When a user summons an agent, the API route shells out to the `claude -p` CLI as a child process and proxies its stdout over Server-Sent Events back to the browser.

```
Browser ──SSE──► Next.js API routes (in-process)
                        │
                   child_process.spawn("claude", args)
                        │
                   NDJSON stdout → broadcast over SSE
```

The Tauri shell (optional) wraps this Next.js server and exposes it as a desktop window. In `pnpm dev` the server runs on **port 3000**; the Tauri dev shell uses port **5173**.

---

## API layer & conventions

API routes are **thin HTTP controllers**, not a place for business logic. The
median route is ~20 lines; ~90% are under 50. When a route needs to *do* a lot,
that logic belongs one layer down in `packages/domain`, not in the route file.

### Layer cake & dependency direction

```
route.ts  (apps/web/src/app/api)   ── HTTP: parse, validate, shape response
   │  depends on
lib helpers (@/lib/*)              ── validation, api-helpers, env
   │  depends on
packages/domain services           ── business logic, HTTP-agnostic, reusable
   │  depends on
db / fs                            ── SQLite, ~/.claude on-disk layout
```

**Rule:** dependencies point downward only. Routes import from `@agent-office/domain`;
domain **never** imports from `@/` (app code). Domain logic must be callable from
the scheduler, a CLI, or another route without dragging in Next.js.

### Anatomy of a route

Every handler follows the same four steps — keep them in this order:

1. **Validate path params** — `validateIdParam(...)` *before* any `path.join` with user input.
2. **Validate body** — `validateBody(schema, raw)` with a schema from `lib/validation-schemas.ts`.
3. **Call a domain service** — the actual work.
4. **Shape the response** — `NextResponse.json(...)` or a helper.

Toolbox (already built — reach for these, don't reinvent):

| Need | Use (from) |
|------|-----------|
| Validate an id path segment | `validateIdParam` (`@/lib/api-helpers`) |
| Validate a JSON body | `validateBody(schema, raw)` (`@/lib/validation`) |
| Error responses | `notFound` / `badRequest` / `serverError` / `payloadTooLarge` (`@/lib/api-helpers`) |
| Map `ENOENT` → 404 automatically | `tryService(fn)` (`@/lib/api-helpers`) |
| Read a size-capped text body | `readBoundedText(request, maxBytes)` (`@/lib/api-helpers`) |

### Where things live

| Concern | Home |
|---------|------|
| Request/response validation schemas | `lib/validation-schemas.ts` — always centralized. If it outgrows one file (~400 lines), split into `lib/schemas/<feature>.ts`. Never inline, never per-route. |
| Shared / domain types | `packages/domain/src/types` |
| Constants, catalogs, fixed value sets (error codes, templates, integrations, setting-key maps) | `packages/domain/src/config/<name>.ts` — never a hardcoded array inside a route |
| Business logic (fs, spawn, git, db orchestration), framework-agnostic | `packages/domain/src/services/<domain>/<feature>.ts` — grouped by domain (`accounts`, `agents`, `analytics`, `execution`, `infra`, `projects`, `skills`, `docs`, `db`); re-exported through the package barrel |
| Logic that *needs* the web runtime (Next `Request`/`Response`, server-process store, OS-terminal spawn, port allocation) | `apps/web/src/lib/server/<feature>.ts` — **not** domain |
| A response DTO used by only one route | Inline in the route; promote to a local `types.ts` **only when a sibling route also needs it** |
| Tiny route-local helper | An inline function in `route.ts` is fine |

### The split ladder

`route.ts` stays a controller. The moment non-boilerplate logic exceeds ~1 screen,
**extract a domain service** — don't grow the route or add a co-located `functions.ts`.
Per-route satellite files (`types.ts` / `schemas.ts` next to a route) are the
*exception* for a single genuinely complex feature folder, never the default rule.

The ladder has been applied across the whole `api/` surface — the largest route is
now ~90 lines (down from 300–390). Keep it that way: audit periodically with
`find apps/web/src/app/api -name route.ts | xargs wc -l | sort -rn | head`, and when
a route climbs past ~1 screen of non-boilerplate, push the excess into a domain
service or a `lib/server` helper before it grows further.

### Trust boundaries (untyped input)

External or parsed data (request bodies, `JSON.parse` of on-disk files) enters as
`unknown` and is **validated with Zod before use** — never cast to a concrete
interface (`as SomeShape` is a lie the runtime can break). `validateBody(raw: unknown)`
is the sanctioned boundary for request bodies; the same rule applies to external
files (e.g. `credentials.json` plan detection in `/api/account`). This is the one
place `unknown` is allowed under the "no `any` / `unknown`" rule — because it's the
*safe* type at a boundary, immediately narrowed by a schema.

### Errors are machine codes, not sentences

Every error the API or an SSE stream emits is a **stable `snake_case` code**, never a
human sentence — the client owns i18n (next-intl maps the code → localized copy).
Write `badRequest("agent_required")`, not `badRequest("Agent is required")`. Run
failures are enumerated once in `packages/domain/src/config/run-errors.ts`
(`RUN_ERROR_CODES` + `isRunErrorCode`); the SSE `error` event carries `{ code, detail? }`
where `detail` is short raw context, never transcript prose.

> Regression that motivated this: the run-stream route once emitted a `message`
> field the client never reads. Four hand-written sentences were silently dropped and
> every one rendered as the generic "unknown" card. If it isn't a code the client
> knows, the user never sees it.

### Fixed value sets = const-array + derived type + guard

A closed set of strings (error codes, icon classes, templates, setting keys) lives in
`packages/domain/src/config/<name>.ts` as one declaration that feeds the type, the
runtime membership check, and any iteration:

```ts
export const THINGS = ["a", "b", "c"] as const;
export type Thing = (typeof THINGS)[number];
export const isThing = (v: unknown): v is Thing =>
  typeof v === "string" && (THINGS as readonly string[]).includes(v);
```

Never hardcode the same list inside a route — a `const CLASSES = [...]` array that
duplicates a union type declared elsewhere is the exact anti-pattern this replaces.

### Domain vs. lib/server — where extracted logic goes

When logic leaves a route it goes to **exactly one** of two homes:

- `packages/domain/src/services` — framework-agnostic (fs, git, spawn, db, pure
  computation). Must be callable from the scheduler or a CLI with no Next.js import.
- `apps/web/src/lib/server` — needs the web runtime (server-process store, terminal
  spawn, port allocation). Keeping these *out* of domain is what preserves domain's
  portability.

Two sibling routes needing the same helper → extract once and import from both (build
+ dev share `lib/server/terminal.ts` and `lib/server/project-runtime.ts`). Never
copy-paste logic between routes.

### HTTP-agnostic services return discriminated results

A domain service that can fail in ways the route must translate to a status code
returns a tagged result instead of throwing a string:

```ts
type Result<T> = { ok: true; value: T } | { ok: false; error: string; status: number };
```

The route maps `ok: false` → `NextResponse.json({ error }, { status })`. Status codes
stay at the HTTP layer; the domain stays transport-free.

### When to reach for ts-pattern

`match(x).with(...)` earns its place when **one value is fanned out to several
mutually-exclusive alternatives** — a discriminated-union `name`, a status string, a
terminal name. It is the *wrong* tool for:

- guard clauses / early returns (`if (!x) return …`);
- applying several **independent** optional fields (a conjunction — e.g. a settings
  PATCH merging `features` + `integrations` + `firstRunComplete`);
- fanning over `Promise.allSettled` results.

Heuristic: *"Is one value being compared against several cases?"* → `match`. *"Am I
doing several unrelated things?"* → plain `if`s. Don't add the dependency for a
two-arm boolean.

### Standing conventions

- Every `route.ts` opens with a one-line `//` banner naming its endpoints + purpose
  (`// GET/PATCH /api/settings — app settings …`). Use `//`, never `/** */`, for the
  file banner — consistency across the surface.
- API and SSE errors are machine codes, not sentences (see above).
- `params` is `Promise<{ ... }>` in App Router handlers → always `await params`.
- `validateIdParam` (or `isValidIdSegment`) gates any user input used in a `path.join`.
- No `any`. No `unknown` except at a validated trust boundary (above).
- Read env via the `env` module (`@/lib/env`), never `process.env` directly.

---

## Summon flow

```
POST /api/summon
  → buildClaudeArgs() (packages/domain/src/services/execution/summon.ts)
  → buildAugmentedPath() — prepends NVM dirs + ~/.local/bin + /usr/local/bin
  → spawn("claude", args, { env: augmentedEnv })
  → NDJSON stdout parsed line-by-line
  → events broadcast over liveRuns registry
  → GET /api/runs/:id/stream (SSE) delivers to browser
  → finalizeRun() writes to SQLite on exit
```

### CLI argv order (buildClaudeArgs)

| Position | Flag | Value source |
|----------|------|-------------|
| 0 | `-p` | hardcoded |
| 1 | `--agent` | hardcoded |
| 2 | `<agentId>` | request.agentId |
| 3 | `--output-format` | hardcoded |
| 4 | `stream-json` | hardcoded |
| 5 | `--include-partial-messages` | hardcoded |
| 6 | `--verbose` | hardcoded |
| opt | `--model <model>` | request.model → instance.model → agent.defaultModel (omitted if "default") |
| opt | `--effort <effort>` | request.effort → instance.effort → agent.defaultEffort (omitted if "default") |
| opt | `--max-budget-usd <n>` | request.maxBudgetUsd (omitted if ≤0) |
| opt | `--permission-mode <mode>` | instance.permissionMode → agent.permissionMode |
| per dir | `--add-dir <dir>` | each entry in agent.addDirs[] (tilde-expanded) |
| opt | `--append-system-prompt-file <file>` | buildAppendedPrompt() output, written to a temp file (sidesteps arg-length limits) |
| opt | `--resume <sessionId>` | request.resumeSessionId |
| last | `<prompt>` | priorContext (last 8 messages) + request.prompt (or just prompt on --resume) |

**Resume retry:** If the run exits code 1 with stderr `"No conversation found with session ID"`, the app automatically retries the spawn without `--resume`.

### Per-run spawn environment (multi-account) — `resolveSpawnEnv` (runs.ts)

The child `claude` process env is built per run from the project's frontmatter:

- **Claude account:** an explicit `opts.accountId` (or the project's `meta.accountId`) that is non-`default` → `CLAUDE_CONFIG_DIR = <account's config dir>`. `default`/unset → inherits the shared `~/.claude`.
- **GitHub account:** the project's `meta.githubAccountId` that is non-`default` → `GH_CONFIG_DIR = <account's gh config dir>` **and** a git credential helper injected via `GIT_CONFIG_*` env (reset the `github.com` helper, then `!gh auth git-credential`, which reads `GH_CONFIG_DIR` at runtime). This makes `git push`/`fetch` — not just the `gh` CLI — authenticate as the project's GitHub identity, **without mutating the user's global `~/.gitconfig`**. `default`/unset → no injection (inherits the machine's active gh auth).

### System prompt composition order (buildAppendedPrompt)

1. Skills (most stable — each skill's SKILL.md body)
2. Global memory (`~/.claude/agents/_global.memory.md`)
3. Project context (from roster instance metadata)
4. Project memory (`~/.claude/projects/<id>/project.md` body section)
5. Per-agent memory (`~/.claude/agents/<id>.memory.md`)
6. History note — **omitted if permission-mode is `plan`**

---

## SSE events

Wire format: `event: <name>\ndata: <json>\n\n`

| Event | Payload fields | When emitted |
|-------|---------------|-------------|
| `attached` | `runId, output, tokensIn, tokensOut, cost, status, startTs` | Late subscriber joins an in-progress run; replays event log |
| `chunk` | `runId, text` | Each text delta from claude's stdout |
| `tool` | `runId, name, input?` | Tool use block detected |
| `usage` | `runId, tokensIn, tokensOut, cost` | Per-message and on result event |
| `done` | `runId, exitCode, sessionId?, durationMs?, tokensIn?, tokensOut?, cost?` | Run finalized (success or failure) |
| `error` | `runId, message` | Spawn error or `is_error` result |
| `rate-limit` | `runId, message, resetsAt?, severity` | Anthropic rate limit hit **or** approaching. `severity: "warning"` = approaching (run keeps going, amber "Continue" card); `severity: "limit"` = hard limit (red "Retry" card). Derived from the CLI `rate_limit_event` status via `buildRateLimitEvent`. |
| `subagent` | `runId` + sub-agent fields (name, prompt, status, startTs, subRunId, …) | A sub-agent spawn (`Task`/`Agent` tool) detected — drives the WorkflowPill tree |
| `subagent-update` | `runId` + status/progress fields | Sub-agent status / token / tool progress update |

**Workflow tree:** `tool` events with `name: "Agent"` or `"Task"` are detected by the `useWorkflowTree` hook to build a live sub-agent spawn tree displayed in `WorkflowPill`. The tree is fetched from `GET /api/runs/:id/workflow` which queries the `runs` table for rows where `parent_run_id = runId`.

**Replay:** `chunk`, `tool`, `usage` are stored in `run.eventLog` and replayed to late subscribers. `done` and `error` are not replayed (they're terminal).

**Heartbeat:** `: keepalive` every 25 seconds.

**Endpoint:** `GET /api/runs/:id/stream`

---

## SQLite schema

**Path:** `~/.claude/agent-office/db.sqlite`
**Pragmas:** WAL mode, `foreign_keys = ON`, `synchronous = NORMAL`
**Migrations:** forward-only, tracked via `user_version` — currently at v13. Each step runs in a transaction on open (`packages/domain/src/services/db/migrations.ts`).
**Crash recovery:** On open, `reapOrphanedRuns` marks a `status='running'` run as `status='error', exit_code=-1` **only if its `owner_pid` is no longer alive** — a run whose spawning process survived (e.g. a browser reconnect) is left running. A NULL `owner_pid` is treated as orphaned. Pipelines with no still-live run → `status='error', interrupted=1`.

### Tables

| Table | Key columns | Notes |
|-------|------------|-------|
| `runs` | id, agent_id, instance_id, project_id, session_id, status, exit_code, prompt, output, tokens_in, tokens_out, cost_usd, dur_ms, model, effort, cwd, started_at, ended_at, parent_run_id, account_id, owner_pid, rate_limited_resets_at | Core run record. `parent_run_id` links sub-agents |
| `messages` | id, run_id, agent_id, instance_id, role, content, ts | Truncated: user ≤2000 chars, assistant ≤8000 |
| `tool_calls` | id, run_id, name, input, ts | Best-effort insert |
| `recent_prompts` | id, agent_id, prompt, used_at | Max 10 per agent |
| `transcripts` | PK(agent_id, instance_id), items, active_run_id, session_id, queued_messages, updated_at | Full chat thread as JSON array; `queued_messages` holds messages typed while a run is in flight |
| `drafts` | PK(agent_id, instance_id), text, updated_at | Composer draft persistence |
| `ui_settings` | key, value, updated_at | Office layout, theme, etc. Internal keys prefixed `_` hidden from GET |
| `pipelines` | id, project_id, status, created_at, ended_at, interrupted | Multi-step pipeline run record |
| `pipeline_steps` | PK(pipeline_id, step_index), parallel_group, agent_id, run_id, status, output, exit_code | One row per step |
| `saved_prompts` | id, title, body, category, created_at, use_count | Reusable multi-step workflow library |
| `accounts` | id, label, config_dir, created_at | Claude accounts; each maps to a `CLAUDE_CONFIG_DIR`. `default` → `~/.claude` |
| `github_accounts` | id, label, config_dir, created_at | GitHub accounts; each maps to a `GH_CONFIG_DIR`. `default` → system gh config |
| `scheduled_jobs` | id, fire_at, summon_request, reason, label, status, attention, attempts, fired_run_id, created_at, updated_at | Serialized summon + fire time; drives manual scheduling and rate-limit auto-resume |
| `secrets` | id, name, label, value, expires_at, test_cmd, verify_before_run, last_tested_at, last_test_ok, created_at | Named env var injected into runs. Plaintext values |
| `project_secrets` | PK(project_id, secret_id) | Many-to-many link attaching a secret to projects |

### Virtual table

`messages_fts` — FTS5 virtual table over `messages`, kept in sync by triggers. Powers the `/search` route and `Cmd+K` palette.

### Indexes

`idx_runs_agent`, `idx_runs_project`, `idx_runs_instance`, `idx_runs_parent`, `idx_runs_account`, `idx_runs_started_at`, `idx_messages_run`, `idx_messages_ai`, `idx_tool_calls_run`, `idx_prompts_agent`, `idx_pipeline_steps_pipeline`, `idx_pipelines_project`, `idx_saved_prompts_category`, `idx_saved_prompts_created`, `idx_scheduled_jobs_status`, `idx_project_secrets_project`, `idx_project_secrets_secret`

---

## On-disk layout

| Path | R/W | What it is |
|------|-----|-----------|
| `~/.claude/agents/` | R/W | Agent definition `.md` files |
| `~/.claude/agents/<id>.md` | R/W | Agent definition + system prompt body |
| `~/.claude/agents/<id>.memory.md` | R/W | Per-agent memory (≤256 KB) |
| `~/.claude/agents/<id>.body.<ISO>.md` | W | Body backup snapshot (max 10 per agent) |
| `~/.claude/agents/_global.memory.md` | R/W | Global memory injected into every agent |
| `~/.claude/agents/_skills/` | R/W | Installed skill packs |
| `~/.claude/agents/_skills/<name>/SKILL.md` | R/W | Skill body |
| `~/.claude/agents/_skills/<name>/.source.json` | R/W | Provenance (source, ref, sha, installedAt) |
| `~/.claude/agents/_skills/_registry.json` | R/W | Skills registry cache (1 hr TTL) |
| `~/.claude/agents/_uploads/<agentId>/` | R/W | Per-agent file uploads |
| `~/.claude/projects/<id>/project.md` | R/W | Project metadata + roster YAML + memory body |
| `~/.claude/projects/<id>/_uploads/` | R/W | Per-project file uploads |
| `~/.claude/agent-office/db.sqlite` | R/W | SQLite database |
| `~/.claude/agent-office-settings.json` | R/W | App settings (projectsRoot, excluded, firstRunComplete) |
| `~/.claude/.credentials.json` | R | Claude auth credentials (plan detection) |
| `<projectCwd>/.worktrees/<instanceId>/` | R/W | Git worktree per agent instance |
| `<projectCwd>/.ao.json` | R | Per-project build/dev command overrides |

---

## CSRF / security model

`apps/web/src/middleware.ts` guards every `/api/*` route. Safe methods (`GET`, `HEAD`, `OPTIONS`) pass unconditionally. For state-changing methods, if an `Origin` header is present its host must equal the `Host` header — otherwise the request is rejected with `403`. Requests without an `Origin` header (same-origin navigations, server-to-server) pass.

The check trusts the `Host` header, so it defends against cross-site requests but not DNS rebinding, where both `Origin` and `Host` resolve to an attacker domain. Since `/api/summon` spawns `claude -p` with `bypassPermissions`, deployments exposed beyond localhost should pin `Host` to a literal allowlist.

---

## Environment variables

Validated once at startup by `apps/web/src/lib/env.ts` (Zod schema). Read env through `env` from that module, never `process.env` directly.

| Variable | Default | What it controls |
|----------|---------|-----------------|
| `ANTHROPIC_API_KEY` | — | Passed to every `claude` subprocess. Warns (not fatal) when missing so builds work in CI |
| `AGENT_OFFICE_STARTER_DATA` | `<cwd>/starter-data` | Override path to bundled starter-data |
| `AGENT_OFFICE_DOCS_DIR` | bundled `docs/` | Override path to the in-app docs source |
| `AGENT_OFFICE_DB_PATH` | `~/.claude/agent-office/db.sqlite` | Override the SQLite path |
| `AO_DEBUG_TOOLS` | — | Dev-only. Any non-empty value enables verbose tool-call logging in the summon wrapper |
| `DEFAULT_LOCALE` | `"en"` | i18n locale (next-intl) |
| `NODE_ENV` | `"development"` | `"development"` enables React Query Devtools |
| `NEXT_PUBLIC_POLL_RUNS` | `5000` | Run list polling interval (ms) |
| `NEXT_PUBLIC_POLL_HEALTH` | `30000` | Health check polling interval (ms) |
| `NEXT_PUBLIC_POLL_SKILLS_UPDATES` | `60000` | Skills update check interval (ms) |
| `NEXT_PUBLIC_APP_VERSION` | — | App version shown in the UI (injected at build) |
| `NEXT_PUBLIC_GIT_SHA` | — | Build commit SHA shown in the UI (injected at build) |

