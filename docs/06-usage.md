# Usage

Day-to-day workflows: the isometric office floor, sending agents to work and streaming their output, run history, multi-step pipelines, multi-instance worktrees, spend tracking, the processes panel, and roster updates.

## Office floor — the isometric workspace

The Office page renders a top-down isometric floor with rooms, walls, decorations, and one desk per agent instance in the currently-active project. Drag desks to reposition; drag agents from the sidebar onto empty tiles to add them to the roster.

### Navigation

- **Wheel** — zoom.
- **Middle-drag** or **space+drag** — pan.
- **Click a desk** — opens the agent details modal.
- **Alt+←/→** — previous/next instance of the same agent.
- **Drag desk** — reposition (persisted to `ui_settings`).
- **Drag agent from sidebar** — add to roster.
- **Drop instance on trash** — remove from roster (cleans up worktree).

### Status LEDs

Each desk has a colored dot indicating the agent's state:

| Color | Meaning |
|---|---|
| 🔵 blue | Working — subprocess running, streaming |
| 🟣 purple | Thinking — model computing, no output yet |
| 🟢 green | Done — last run completed successfully |
| 🟡 amber | Queued — waiting on rate limit or dispatch queue |
| 🔴 red | Error — last run failed |
| ⚪ gray | Idle — no active run |

### Build mode

Toggle the wrench icon to enter **Build mode**. In build mode you can:

- Paint the grass tile color.
- Place decorations (plants, computers, coffee).
- Add walls to define rooms.
- Rename rooms.

Layout is per-project; stored in `ui_settings` keyed by `office:<projectId>`.

### Rooms

Rooms are visual groupings on the floor. Assigned via `room:` in an agent's frontmatter (e.g. `room: Boardroom`). The office auto-arranges desks into their room's rectangle.

## Summon & Runs — sending agents to work

### How a run works

1. You type a prompt in the chat panel and hit Send.
2. `POST /api/summon` spawns a `claude` subprocess with the composed system prompt.
3. Output streams back via `GET /api/runs/:id/stream` (SSE).
4. The chat panel renders each `chunk` event as it arrives.
5. On subprocess exit, the run is finalized in SQLite with token counts, cost, and duration.

### Aborting a run

Click the ✕ button next to a running message, or `POST /api/runs/:id/abort`. SIGKILL is sent to the subprocess. Partial output is preserved.

Bulk-abort: `POST /api/runs/abort-all` kills every in-flight run for the current workspace.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | Agent error (Claude returned `is_error: true`) |
| `130` | SIGINT / SIGTERM (server restart or user abort) |
| `143` | SIGTERM (usually a rate-limit-triggered kill) |

## Run history — every run, stored forever

Every run is persisted to `~/.claude/agent-office/db.sqlite`. Access via the History tab in the agent details modal, or query directly with `sqlite3`.

### Fields on `runs` table

- `id`, `agent_id`, `agent_name`, `instance_id`, `instance_label`
- `project_id`, `session_id`
- `status` — `running` · `done` · `error`
- `exit_code`, `prompt`, `output`
- `tokens_in`, `tokens_out`, `cost_usd`, `dur_ms`
- `model`, `effort`, `cwd`
- `started_at`, `ended_at` (unix milliseconds)
- `parent_run_id` — set for sub-agent runs spawned by a Task tool call

### Querying directly

```bash
sqlite3 -header -column ~/.claude/agent-office/db.sqlite "
  SELECT model, COUNT(*), ROUND(SUM(cost_usd), 2) AS cost
  FROM runs
  WHERE started_at > (strftime('%s','now') - 604800) * 1000
  GROUP BY model
  ORDER BY cost DESC;
"
```

### Full-text search

Press **Cmd+K** to open the command palette, then start typing to run FTS across every stored message. Powered by the `messages_fts` FTS5 virtual table.

### Run tree

`GET /api/runs/:id/tree` returns the full parent → sub-agent → sub-sub-agent hierarchy. The History tab renders this as a collapsible tree so you can see which orchestrator dispatched which specialists.

### Children

`GET /api/runs/:id/children` is the flat single-level version — direct sub-agents only.

## Pipelines — multi-step agent chains

A pipeline runs multiple agents in sequence, feeding one's output into the next. Defined as an array of steps.

### Step types

| Type | Meaning |
|---|---|
| `agent` | Run one agent with a prompt. |
| `parallel` | Run multiple agents at the same time; collect all outputs. |
| `human-gate` | Pause and wait for human confirmation before continuing. |
| `condition` | Skip subsequent steps if a predicate is false. |

### Timeouts

Each step has a per-step timeout (default 30 min). Pipelines have an overall timeout (default 2 h).

### Recovery on restart

If the app restarts mid-pipeline, in-flight steps are marked as `interrupted` and the pipeline can be resumed from the last completed step.

### API

- `POST /api/pipeline` — create + start. Returns `202` with `{pipelineId}`.
- `GET /api/pipeline/:id` — poll status.

### Example: 3-step pipeline with a parallel group

```json
{
  "steps": [
    { "type": "agent",    "agent": "planner",    "prompt": "Plan the migration" },
    { "type": "parallel", "steps": [
        { "type": "agent", "agent": "developer-lite", "prompt": "Update codebase" },
        { "type": "agent", "agent": "qa-code-review", "prompt": "Review the diff" }
    ]},
    { "type": "agent", "agent": "release-engineer", "prompt": "Cut the release" }
  ]
}
```

## Multi-instance & worktrees

You can drop the same agent onto a project multiple times — each drop creates a new instance with its own worktree, chat history, and memory.

### Worktree isolation model

- Each git-backed project → one worktree per instance at `<projectRoot>/.worktrees/<agent>-<random>` on branch `agent/<agent>-<random>`.
- Non-git projects → no worktree; instance runs directly in `cwd`.
- Worktree is created on instance add, removed on instance remove.

### Instance caps

- Max instances per agent per project: 8 (soft — configurable via `ui_settings.instanceCap`).
- Max instances total per project: 24.

### Non-git fallback

Non-git projects display a warning banner and prevent adding more than one instance of any agent to avoid conflict.

### Instance lifecycle

- **Add** — `POST /api/projects/:id/roster` creates the instance + worktree.
- **List** — `GET /api/projects/:id/roster` returns all instances.
- **Update** — `PATCH /api/projects/:id/roster/:instanceId` — change label, unit, model override, effort override.
- **Remove** — `DELETE /api/projects/:id/roster/:instanceId` — cleans worktree and archives history.
- **Repair worktree** — `POST /api/projects/:id/roster/:instanceId/repair-worktree` — recovers a broken worktree by regenerating it from the current branch.

### Boot reconciliation

On server start, `services/roster.ts` walks each project's stated roster and reconciles it with on-disk worktrees. Missing worktrees are recreated; orphan worktrees are archived to `.worktrees/_archive/`.

## Spend tracking

Every run records its cost, tokens, and duration in the `runs` table, so spend is fully tracked — but Agent Office does not enforce hard spend caps or quotas. Runs are never auto-refused on cost; the only run-blocking signal is an Anthropic API rate limit, which surfaces as a rate-limit card in the chat thread (see the rate-limit handling in `services/runs.ts`). From that card you can **auto-resume the run when the limit resets** — see [Schedules](#/schedules).

Where to see spend:

- **Analytics page** (`/analytics`) — spend by model, agent, project, plus trend and per-account breakdown.
- **Per-project** — `GET /api/projects/:id/spend` returns a USD breakdown by instance.
- **Per-instance** — `GET /api/projects/:id/roster/:instanceId` includes the instance's accumulated USD spend.
- **Usage & spend modal** — daily spend and per-agent cost over a period, plus your Claude plan badge. Derived from your local `runs` history — not a read of Anthropic's session / 5-hour / weekly limits.

> [!NOTE]
> If you need a hard budget ceiling, cap it at the Anthropic account level — Agent Office reports usage but does not stop runs at a dollar threshold.

## Processes panel

Every dev server, build, and background process spawned by Agent Office is captured. Open the Processes panel to see live status and stream stdio.

### Accessing the panel

Toolbar → Processes icon (or `Cmd+Shift+P`).

### Log tailing

`GET /api/processes/:pid/logs?since=<offset>` returns captured stdout/stderr from `since` onwards. The panel polls this to render live logs.

### Process lifecycle

- Foreground processes started by an agent (`nohup dev &`) are NOT captured unless started via `POST /api/projects/:id/dev`.
- Processes started outside Agent Office (e.g. in a separate terminal) are listed for visibility only. Their stdio is not captured, so log tailing returns `found: false`.

### Send stdin

For processes that accept stdin (interactive shells), `POST /api/processes/:pid/stdin` with `{text}` sends the input.

## Roster migration — applying bundled agent updates

Every release ships a bundled roster in `apps/web/starter-data/agents/` alongside a `MANIFEST.json` that pins each agent to a content hash. When the bundled version differs from the version this workspace last applied, the migration modal opens on next app launch.

### What you see

Three lists, each with a per-row accept / skip toggle:

| Section | What it contains | Default |
|---|---|---|
| New in this version | Bundled agents you don't have installed yet. | Accepted |
| Changed since last install | Agents you have — the bundle now ships a modified version. | Skipped |
| Only in your local install | Agents the bundle doesn't ship (your customs stay untouched). | Read-only |

### What happens on accept

1. **Backup** — the current file is copied to `~/.claude/agents/_archive/<slug>.pre-<version>-backup.md`.
2. **Override** — the bundled `.md` is copied over the installed one.
3. **Persist skip** — skipped slugs are written to `~/.claude/agent-office/agent-manifest-skipped.json` so they don't re-nag until the bundle version changes again.
4. **Stamp version** — the current bundle version is written to `~/.claude/agent-office/agent-manifest-version`. The modal won't fire again for this version.

> [!TIP]
> Custom agents (in *Only in your local install*) are never touched by the modal. Your customizations survive every roster update.

### Trigger conditions

The trigger opens the modal only when ALL of the following are true:

- First-run wizard has completed (`firstRunComplete === true`).
- Bundle `MANIFEST.json` version differs from the installed version marker.
- At least one entry in *New* or *Changed* — otherwise the version is stamped silently.
