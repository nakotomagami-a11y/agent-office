# Bundled starter agents

This directory is the shipped default roster of Agent Office. When someone
downloads the app, the first-run wizard (and the "Bundled agents" tab in
Settings) offers to import these into `~/.claude/agents/`.

## Layout

```
apps/web/starter-data/agents/
├── MANIFEST.json                 ← generated; do not hand-edit
├── regenerate-manifest.mjs       ← run me after any change
├── README.md                     ← you are here
├── <agent-id>.md                 ← agent definition (required)
└── <agent-id>.identity.md        ← foundational memory (optional)
```

Each agent is a Markdown file with YAML frontmatter — the same shape Claude
Code reads from `~/.claude/agents/`. `regenerate-manifest.mjs` walks this
folder, hashes each `.md`, and writes `MANIFEST.json`. The version stamp in
that manifest is what triggers the in-app migration modal for users who
already have a previous bundle installed.

## Identity vs. memory — the split

Two sibling file types live alongside `<agent-id>.md`:

| File                       | Purpose                                            | Ships with the app? | Migrated by the app? |
| -------------------------- | -------------------------------------------------- | ------------------- | -------------------- |
| `<agent-id>.md`            | The agent itself — frontmatter + system prompt     | ✅ Yes              | ✅ Yes               |
| `<agent-id>.identity.md`   | Foundational knowledge that is part of who it is   | ✅ Yes (optional)   | ✅ Yes               |
| `<agent-id>.memory.md`     | Session-accumulated learnings for THIS install     | ❌ Never            | ❌ Never             |

The distinction matters because "memory" in ~/.claude/agents/ ends up being
two very different things in practice:

1. **Identity memory** — a character trait, a hard-earned lesson that defines
   how the agent works. Example: an `orchestrator` that knows its own
   coordination doctrine ("research → implement → QA → UI, always"). Ship
   this as `orchestrator.identity.md` so every fresh install gets it.

2. **Accumulated memory** — this user's project internals, personal machine
   quirks, or one-off session learnings. Example: "the Agent Office pipeline
   API is at `/api/pipeline` and expects `parallel_group` field". This is
   session state, not identity. It stays in `<agent-id>.memory.md` on the
   user's machine and never leaves.

**Rule of thumb**: if the content only makes sense in the context of
_this_ codebase or _this_ user's machine, it's memory. If it would make an
agent worse without it, on any machine, it's identity.

## How the runtime uses these

`buildAppendedPrompt` in `packages/domain/src/services/agents.ts` composes
the per-summon system prompt in this order:

1. **Skills** — from frontmatter `skills:` list.
2. **Identity** — `<agent-id>.identity.md` content, if present.
3. **Global memory** — `~/.claude/agents/_global.memory.md`.
4. **Project memory** — per-project memory file.
5. **Per-agent memory** — `<agent-id>.memory.md`.
6. **Conversation history note** — SQLite pointer to prior runs.

Identity sits above all three memory layers because it is static and
authored, not accumulated.

## Editing workflow

1. Change any `.md` file in this directory.
2. From the repo root, run:
   ```bash
   node apps/web/starter-data/agents/regenerate-manifest.mjs
   ```
   This rewrites `MANIFEST.json` and bumps the version stamp (today's date
   plus a counter — e.g. `2026-07-15-1`, `2026-07-15-2`).
3. Commit the `.md` change and the `MANIFEST.json` change in the same
   commit so downstream users see the version bump alongside the content
   change.

The next time a user launches Agent Office, the migration modal fires with
a three-list diff (new / changed / local-only), backs up any file they
choose to override into `~/.claude/agents/_archive/`, and stamps the new
version so it doesn't re-nag.

## What is _not_ in this directory

- **`<agent-id>.memory.md`** — never bundled. Grows on the user's machine.
- **`<agent-id>.body.<timestamp>.md`** — versioned body snapshots from the
  in-app editor; user-local only.
- **`_archive/`, `_uploads/`, `_skills/`** — runtime scratch dirs under
  `~/.claude/agents/`. The bundle never touches these.
- **`_global.memory.md`** — machine-wide memory. User-local only.
