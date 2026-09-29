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

## Non-obvious

- Agents are spawned as `claude -p` child processes; **stdin is closed**, so a
  tool call needing an interactive prompt has nothing to prompt.
- Agent definitions live in `~/.claude/agents/` (user data, not this repo) and
  edits take a short while to propagate to the CLI.
- `packages/domain` must not import from `@/` — see `arch.domain-no-app-imports`.
