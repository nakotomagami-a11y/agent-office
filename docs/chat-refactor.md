# Chat conversation layer — refactor design (server-authoritative)

Status: **Shipped — client cutover complete (2026-09-09).** Server model, all
API routes, and the client (`ChatPanel` → `useConversationChatModel`) are live.
Verified: 31 unit/integration tests + 2 real-spawn e2e tests, `tsc --noEmit`
clean on both packages, live browser check against real production data
(disabled Retry on historical failed turns, correct `idle`/turns/queue shape
from `/api/conversations`). Old client files deleted (see "Delete" section —
all done except `transcript-store.ts`'s three DB-write functions, kept as
dead code per the migration note below). Remaining optional follow-up: decide
whether to remove `/api/transcripts` POST/PUT entirely (currently has zero
callers, GET is unused too) — tracked in NEXT_SESSION.md, not blocking.

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
   A turn = one user message → one run (runs already store prompt/output/session/
   status/exit/ts/cost/tokens).
3. **The active run is always the last turn.** Live tokens render at the tail — there
   is nothing in the middle to splice or truncate.
4. **The queue is a first-class server FIFO**, drained by exactly one driver (the
   server, on run finalize), only while the app/server is alive.
5. **Failures pause and ask.** A run that ends in error / interrupt / rate-limit sets
   the conversation to `needs_attention`, keeps the queue intact, and surfaces
   explicit actions. Nothing auto-fires.

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

Conversation status: `idle → running → (idle | needs_attention)`.

- **Send a message** (`POST /conversations/:id/messages`):
  - `idle` → start a run now (resume `sessionId`), status `running`, `activeRunId` set.
  - `running` → append to `queued_messages`; return queued position.
  - `needs_attention` → append to queue too, but do **not** start; the user must
    resolve the failed turn first (or Skip). UI makes this explicit.
- **Run finalizes** (hook in `finalizeRun`):
  - exit 0 → store `sessionId` on the conversation; pop the next queued message and
    start it (resume session), or go `idle` if the queue is empty.
  - error / interrupt / rate-limit → status `needs_attention`; **queue preserved
    exactly as-is**; surface the terminal run so the client shows the card + actions.
    Auto-advance is paused, NOT cancelled.
- **Resolving `needs_attention`** — the queue is never lost here:
  - **Retry** → re-run the failed turn's prompt (same session). On success, the
    remaining queue resumes draining automatically.
  - **Resume** → continue the session as a new turn ("continue where you left off").
    On success, the remaining queue resumes draining automatically.
  - **Skip** → discard only the failed turn, then immediately advance to the next
    queued message.
  - **Clear queue** → the only action that intentionally drops pending items.
- **New thread** (`POST /conversations/:id/new`): a fresh conversation row for the
  SAME `(agentId, instanceId)` slot with a null session; the old conversation and its
  queue are abandoned (explicit user action). No queued prompt crosses a session.

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
- **Retry** — re-run the same user prompt.
- **Skip** — discard the failed turn, advance to the next queued message.
- **Schedule resume** — existing rate-limit auto-resume (rewired to this status).
- **Clear queue / Stop**.

The pending queue is always visible (listed items, removable individually), so the
user can see exactly what is waiting and reorder/remove. Nothing auto-runs.

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

## API surface (new)

```
GET    /api/conversations?agentId&instanceId        -> conversation state
POST   /api/conversations                           -> ensure/create for a slot
POST   /api/conversations/:id/messages  { text }    -> start-or-queue
DELETE /api/conversations/:id/queue/:messageId      -> remove a pending item
POST   /api/conversations/:id/resume                -> continue session (needs_attention)
POST   /api/conversations/:id/retry                 -> re-run failed turn
POST   /api/conversations/:id/skip                  -> discard failed turn, advance
POST   /api/conversations/:id/new                   -> new thread (new session)
POST   /api/runs/:id/abort                          -> (unchanged) stop active run
GET    /api/runs/:id/stream                         -> (unchanged) live SSE
```

## Phases

- **P1 Audit** ✅
- **P2 This doc** ← sign-off gate
- **P3 Build** server model + endpoints + finalize-hook driver; new thin client hook
  behind the existing UI; run engine untouched.
- **P4 Cut over + migrate + regression harness** for: history truncation, stale-queue
  resurrection, out-of-order/duplicate drain, session-boundary leakage, failure-pauses-queue.
