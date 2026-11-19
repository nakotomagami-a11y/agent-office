# Chat conversation layer — refactor design (server-authoritative)

Status: **Shipped (2026-09-09), then made live (2026-11-19).** The server-authoritative model below
still holds. What changed in November is how a message reaches the agent: each chat now keeps one
live `claude` process that reads messages while it works (see "Live process" below). The user's
message queue, Skip, and "a send while running waits for the run to end" are gone. Sections below
that describe the old queue are history, marked as such.

## Live process (2026-11)

The user asked for what Claude Code and Codex do: write while the agent works, and have it pick the
message up without being stopped. The CLI supports it: with `--input-format stream-json` and stdin
left open, a message written mid-turn is added to the agent's next tool result ("The user sent a new
message while you were working"). One written while the agent writes its answer runs as the next turn
of the same process. `--replay-user-messages` echoes each message, with the uuid we sent, when the
CLI reads it. Verified against CLI 2.1.327 with a mock API (`runs.chat-session.e2e.test.ts`).

- `execution/chat-session.ts` owns one process per conversation. It handles turns, unread messages,
  background tasks, idle close, Stop (an `interrupt` control request) and respawn when the seat's
  settings change. See `docs/architecture.md`, "Chat processes".
- A turn is still one `runs` row, so everything built on runs (history, cost, loops, missions,
  analytics) is unchanged. Messages read mid-turn are `run_inputs` rows with that turn's `run_id`,
  shown where the agent read them (the `input` SSE event live, `PersistedRun.inputs` after).
- The conversation machine (`conversation-machine.ts`) is reduced to:
  - **A user message is always delivered at once.**
  - **Agent Office's own (`system`) messages wait in the agent queue** (`queued_messages`) until the
    process has nothing open, unread or running in the background. A review round never lands in
    the middle of the user's task (principle 6).
  - **A failed turn pauses only that queue.** The user sends, retries or resumes.
- `startTurnIfIdle` replaces `startIfIdle` and `adoptScheduledRun`. A loop's fix round and a
  scheduled chat job are delivered only to an idle chat, and they learn their run once the turn
  opens.

## Why

The rendered conversation is currently reconstructed on the client by splicing a
live SSE stream into a persisted `thread` array at an index held in a React ref,
mutated by ~7 independent writers, and persisted by a 1s throttled last-write-wins
saver. Every production incident (disappearing history, stale/old task re-run,
queued message not showing, "message vanished") is a different surface of that one
design flaw. See the git history / incident comments in `use-run-recovery.ts`,
`use-transcript-sync.ts`, `use-chat-actions.ts`, `use-queue-drain-daemon.ts`.

Two incidents this fixes by construction:

- **History truncation** — the splice `setThread(prev => [...prev.slice(0,i), ...stream])`
  deletes everything after `i`; a wrong `i` silently drops committed turns and the
  throttled saver persists the truncation. There will be **no splice** after this.
- **Old task re-run / queued item skipped** — the queue is a durable client blob with
  no session binding, drained by two racing paths, with every send implicitly
  resuming the last session. After this the queue is **server-owned, session-bound,
  single-drainer**, and a failed turn **never** auto-advances or silently resumes.

## Principles

1. **The server owns the conversation.** The client renders it and appends to it.
2. **The thread is derived from `runs`**, not a parallel client-authored copy.
   A turn = one run, opened by a message (plus `run_inputs` the agent read mid-turn).
3. **The active run is always the last turn.** Live tokens render at the tail — there
   is nothing in the middle to splice or truncate.
4. **The user's messages go to the agent at once; only Agent Office's wait.** The agent
   queue is a server FIFO, drained by exactly one driver (the process going idle), only
   while the app/server is alive.
5. **Failures pause and ask.** A turn that ends in error / interrupt / rate-limit sets
   the conversation to `needs_attention`, keeps the agent queue intact, and surfaces
   explicit actions. Nothing auto-fires; the user's next message simply goes through.
6. **Nothing else spawns the conversation's agent on its seat.** A review loop's fix
   rounds (`execution/qa-loop.ts`) are `system` messages sent through the
   conversation, and only while it is idle with an empty queue; a busy chat
   makes the round wait (`rekickConversationLoops`). A run started beside the
   conversation would hit the spawn guard and park the user's next message.

## Data model (SQLite)

New `conversations` table:

```
conversations(
  id            TEXT PRIMARY KEY,     -- conversationId (uuid)
  agentId       TEXT NOT NULL,
  instanceId    TEXT NOT NULL,        -- "default" when absent (matches transcriptKey slot)
  projectId     TEXT NULL,
  sessionId     TEXT NULL,            -- current claude --resume session for this conversation
  status        TEXT NOT NULL,        -- 'idle' | 'running' | 'needs_attention'
  activeRunId   TEXT NULL,
  createdAt     INTEGER NOT NULL,
  updatedAt     INTEGER NOT NULL
)
-- one ACTIVE conversation per (agentId, instanceId); "New thread" creates a new row.
```

`runs` gains one column:

```
runs.conversationId TEXT NULL   -- set in startRun; NULL for legacy rows (back-compat)
```

New `queued_messages` table:

```
queued_messages(
  id             TEXT PRIMARY KEY,
  conversationId TEXT NOT NULL,
  text           TEXT NOT NULL,
  attachments    TEXT NULL,       -- JSON, optional
  position       INTEGER NOT NULL,-- FIFO order
  createdAt      INTEGER NOT NULL
)
```

Turns for a conversation = `runs WHERE conversationId = C AND parentRunId IS NULL ORDER BY ts`.
The `transcripts` blob (items/activeRunId/sessionId/queuedMessages) is **retired**
(kept read-only during migration only).

## Lifecycle (the state machine)

Conversation status: `idle → running → (idle | needs_attention)`. `running` = the live
process has a turn open, a message unread, or background work going.

- **Send a message** (`POST /conversations/:id/messages`):
  - the user's, in any status → delivered to the process now (started with `--resume
    sessionId` if there is none); status `running`. It clears `needs_attention`.
  - Agent Office's → delivered now if `idle` with an empty agent queue, else queued.
- **The process reports** (`conversation-wiring.ts`):
  - a turn opened → `activeRunId` set.
  - a turn ended (`finalizeRun`'s listeners) → `sessionId` stored, `activeRunId` cleared.
  - idle (nothing open, unread or in the background) → `needs_attention` if the last
    turn failed; else the next agent-queue message is delivered, or `idle`.
- **Resolving `needs_attention`** — the agent queue is never lost here:
  - **Retry** → send the failed turn's prompt again (same session).
  - **Resume** → send "continue where you left off".
  - **Any message the user sends** → goes through; the agent queue resumes once idle.
  - **Clear queue** → the only action that intentionally drops agent-queue items.
- **New thread** (`POST /conversations/:id/new`): stops the old process and creates a fresh
  conversation row for the SAME `(agentId, instanceId)` slot with a null session. The old
  conversation keeps its turns and queue (explicit user action). Nothing crosses a session.

**Scope / isolation.** A queue belongs to one conversation, which belongs to one
`(agentId, instanceId)` slot. Developer *Session 1* and *Session 2* are different
instanceIds → different conversations → fully isolated queues; neither can see or
drain the other's. "New thread" only resets the claude session within a single
instance; it never touches another instance.

Because the driver lives in the server process and the Tauri app kills the bundled
server on close (`src-tauri/src/lib.rs`), the queue only advances while the app is
open — matching the product requirement. No client daemon, no client race.

## Error / interrupt UX (requirement: always inform + always resolvable)

`needs_attention` drives a persistent, unmissable card on the failed turn with:

- **Resume** — continue the same session as a new turn ("continue where you left off").
- **Retry** — re-run the same prompt.
- **Schedule resume** — rate-limit auto-resume: the scheduler sends it into the chat as its
  next turn (`startTurnIfIdle`).
- **Stop** — interrupts the turn; the process and session stay.

The agent queue is always visible under the thread (removable individually). Messages the user
sent that the agent has not read yet show dashed, marked *Sent*.

## Client rendering (what the UI becomes)

- `GET /api/conversations?agentId&instanceId` → `{ id, status, sessionId, activeRunId,
  turns: RunSummary[], queue: QueuedMessage[] }`.
- Render turns from `turns`; for `activeRunId`, append the live SSE stream (via the
  **kept** `run-stream-registry`) to the last turn.
- Optimistic enqueue: show the user's message as a pending queue chip immediately;
  the server response confirms/replaces it.
- The client no longer persists or mutates the thread array.

## Delete (the rot)

- `runStartIndexRef` + the splice effect + done/fallback splice (`use-run-recovery.ts`).
- `use-transcript-sync.ts` write-through + `throttle-save.ts`.
- `use-queue-drain-daemon.ts` + `queue-drain-daemon-mount.tsx` + `useQueueDrain` in
  `use-chat-actions.ts` (server auto-advances now).
- `transcript-store.ts` client blob + `queuedMessages` in the transcript row.
- The `mountedTKey` daemon-skip patch (superseded — no daemon).

## Keep (proven-good, untouched)

- Server run engine: `execution/runs.ts` `startRun`/`finalizeRun`, SSE, event-log
  replay, orphan detection, `findActiveRunForTarget` spawn guard.
- `run-stream-registry.ts` (live SSE per run) — still the live-token transport.
- Rate-limit detection (`runs/errors.ts`) + scheduler — rewired to conversation status.

## Migration

- Add the two tables + `runs.conversationId`.
- Backfill: for each `(agentId, instanceId)` with a transcript row, create one
  conversation carrying its `sessionId`; assign existing top-level runs for that slot
  to it (by agentId+instanceId, latest wins). History renders from runs.
- Legacy client-only system cards not backed by a run are dropped (ephemeral).
- Hard cut on the client once the endpoints land; `transcripts` GET stays read-only
  for one release for safety, then removed.

## API surface

```
GET    /api/conversations?agentId&instanceId        -> conversation state (turns, pending, queue)
POST   /api/conversations                           -> ensure/create for a slot
POST   /api/conversations/:id/messages  { text }    -> deliver to the live process (system: may queue)
DELETE /api/conversations/:id/queue/:messageId      -> remove an agent-queue item
DELETE /api/conversations/:id/queue                 -> clear the agent queue
POST   /api/conversations/:id/resume                -> continue session (needs_attention)
POST   /api/conversations/:id/retry                 -> re-run failed turn
POST   /api/conversations/:id/new                   -> new thread (new session, old process stopped)
POST   /api/summon                                  -> deliver, answer the run that reads it
POST   /api/runs/:id/abort                          -> stop: interrupt a chat turn, kill a one-shot run
GET    /api/runs/:id/stream                         -> live SSE (`input` = a message read mid-turn)
```

## Phases

- **P1 Audit** ✅
- **P2 This doc** ← sign-off gate
- **P3 Build** server model + endpoints + finalize-hook driver; new thin client hook
  behind the existing UI; run engine untouched.
- **P4 Cut over + migrate + regression harness** for: history truncation, stale-queue
  resurrection, out-of-order/duplicate drain, session-boundary leakage, failure-pauses-queue.
