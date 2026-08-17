# Memory

The three tiers of persistent context — global, per-project, and per-agent — that get injected into every run, where each lives on disk, and how to edit them.

## Persistent context across runs

Three tiers of persistent context are injected into every run. Each tier is a plain Markdown file you can edit from the UI or your text editor.

| Tier | Location | Scope | Written when |
|---|---|---|---|
| **Global** | `~/.claude/agents/_global.memory.md` | Every agent, every project | You edit it |
| **Project** | `~/.claude/projects/<id>/project.md` (body after frontmatter) | Every agent in one project | You edit it |
| **Per-agent** | `~/.claude/agents/<id>.memory.md` | Every run of one agent | Agent can self-write via `MemoryTool`; you can edit |

Injection order: **Skills → Global → Project (context + memory) → Per-agent → History note**. Each tier can override or extend the previous one via prose.

## Example global memory

```markdown
## Machine
- MacBook Pro M3 Max, 64 GB, macOS Sonoma
- Node 22 via nvm, pnpm preferred, Postgres 16 local

## Preferences
- TypeScript strict mode always
- Never use CSS Grid — use Flexbox
- Prefer Zustand for React state, not Redux

## Active project
Currently working on: agent-office (~/Documents/Lab/agent-office)
```

## Editing from the UI

- **Global** — Settings → Global Memory (or `PUT /api/memory/global`).
- **Project** — Project detail → Memory tab.
- **Per-agent** — Agent details modal → Memory tab.

## Editor and preview

The editor has **Write** and **Preview** tabs:

- **Write** — a syntax-highlighted markdown editor with line numbers and live inline highlighting. Save with `Cmd/Ctrl+S`; autosave is off — deliberate, to avoid mid-thought writes. The pane scrolls independently for long files.
- **Preview** — renders full GitHub-flavored markdown (headings, tables, code blocks, callouts) through the same renderer as the in-app [Docs](#/usage) tab, so what you see matches how the docs render elsewhere.

Read-only entries surfaced under an agent in the Memory nav — installed **skills** and agent **reference** files — render that same formatted markdown. They have no edit/save path.

## 256 KB limit

Each memory file is capped at 256 KB. Attempting to write past that limit returns `413 Payload Too Large`. In practice the limit is generous — average per-agent memory is under 5 KB.

## Self-modification races

Agents can write their own memory via the `MemoryTool` skill. Concurrent writes are safe (atomic writes via temp-file rename) but the SECOND write wins — there is no merge. If two agents write simultaneously, the last one's content persists.

## Manual git tracking

If you want to version-control your memory:

```bash
cd ~/.claude
git init
git add agents/_global.memory.md agents/*.memory.md
git commit -m "Snapshot: memory tiers"
```

Nothing in the app cares whether `~/.claude` is a git repo, so this is entirely optional and side-effect-free.
