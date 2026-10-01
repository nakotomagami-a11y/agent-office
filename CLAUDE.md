# Agent Office

Personal multi-agent IDE: run Claude Code agents against real projects, see the
output streamed, keep the history.

## Where things are

| | |
|---|---|
| `apps/web` | Next.js app — UI, API routes, SSE runner |
| `packages/domain` | types, DB layer, services, route config — framework-agnostic |
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
pnpm --filter @agent-office/domain test
```

The `test` script **excludes `*e2e*`**, and CI runs the same command — so two
files never run unless you type it. They are not self-contained: each needs a
throwaway `HOME` and its own stub `claude` on `PATH`, and the two stubs differ
(one must fail auth, the other must stream a session id), so `test:e2e` cannot
run both at once. Until that is fixed they are per-file:

```bash
# auth classification — stub must print an oauth error to stderr and exit 1
HOME=$(mktemp -d) PATH="<stubdir>:$PATH" \
  pnpm exec tsx packages/domain/src/services/execution/runs.auth-e2e.test.ts
```

## Non-obvious

- Agents are spawned as `claude -p` child processes; **stdin is closed**, so a
  tool call needing an interactive prompt has nothing to prompt.
- Agent definitions live in `~/.claude/agents/` (user data, not this repo) and
  edits take a short while to propagate to the CLI.
- `packages/domain` must not import from `@/` — see `arch.domain-no-app-imports`.
