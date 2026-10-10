# Agent Office

Personal multi-agent IDE: run Claude Code agents against real projects, see the
output streamed, keep the history.

## Where things are

| | |
|---|---|
| `packages/domain` | the brains: types, DB layer, services — knows nothing about HTTP |
| `packages/api-contract` | `API_ROUTES` + request schemas — the contract every client builds against |
| `apps/server` | the HTTP API + SSE runner; runs inside the desktop app or alone (`pnpm server`) |
| `apps/web` | the UI (Next.js) + desktop shell; mounts `apps/server` under `/api` |
| `apps/minecraft-mod` | Minecraft client of the same API (Gradle, not pnpm) |
| `docs/architecture.md` | layer cake, route anatomy, where new code goes |
| `docs/conventions.md` | **house rules with ids — lint messages cite these** |
| `docs/chat-refactor.md` | the server-authoritative conversation model |

## Before writing code

1. Read `docs/architecture.md` for the layer you're touching.
2. Read `docs/conventions.md` — the rules are enforced, not advisory.
3. Follow the conventions already in the file you're editing.

## Verify before claiming done

```bash
pnpm -r typecheck
pnpm -r lint
pnpm -r test           # domain, api-contract, server, web
```

Added, moved or deleted a route in `apps/server/src/routes/`? Run
`pnpm --filter @agent-office/server routes` — the route table is generated, and a
test fails while it is stale.

`test` runs through `scripts/run-tests.mjs`, which points **both `HOME` and
`USERPROFILE`** at a throwaway dir (Windows' `os.homedir()` ignores `HOME`; a
HOME-only sandbox once wiped a real `~/.claude/agents/_skills`). Never run test
files with bare `tsx --test`: `paths.ts` throws `test_uses_real_home` if a test
resolves the real profile. Pass files to run a subset: `pnpm --filter
@agent-office/domain test src/services/infra/discovery.test.ts`.

The `test` script **excludes `*e2e*`**, and CI runs the same command — so two
files never run unless you type it. They are not self-contained: each needs its
own stub `claude` on `PATH`, and the two stubs differ (one must fail auth, the
other must stream a session id), so `test:e2e` cannot run both at once. Until
that is fixed they are per-file:

```bash
# auth classification — stub must print an oauth error to stderr and exit 1
PATH="<stubdir>:$PATH" \
  pnpm --filter @agent-office/domain test src/services/execution/runs.auth-e2e.test.ts
```

## Non-obvious

- Agents are spawned as `claude -p` child processes; **stdin is closed**, so a
  tool call needing an interactive prompt has nothing to prompt.
- Agent definitions live in `~/.claude/agents/` (user data, not this repo) and
  edits take a short while to propagate to the CLI.
- Dependencies point one way (`docs/architecture.md`): `domain` ← `api-contract` ← `server`/`web`.
  The UI calls the server over HTTP, never domain services (`arch.web-through-server`).
- Every running server (dev too, never `next build`) advertises itself in
  `~/.claude/agent-office/servers/<pid>.json`, removes its own entry on exit and prunes dead ones at
  boot. The Minecraft mod (`apps/minecraft-mod`, Gradle, not pnpm) tries them newest first and keeps
  the first that answers `/api/health` like Agent Office.
