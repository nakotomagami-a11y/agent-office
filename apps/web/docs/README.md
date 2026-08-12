# App documentation source

Every tab on the in-app `/docs` page is rendered from a file in this
directory. Add a section, get the app to update on save (Next dev HMR
picks it up).

## Files

| File                        | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `_index.json`               | Tab order, labels, and file mapping. Edit to add/reorder.  |
| `README.md`                 | This file. Not rendered in-app.                            |
| `00-features.md`            | Feature overview + positioning vs. the raw Claude Code CLI |
| `01-getting-started.md`     | Onboarding, quick start, first-run wizard                  |
| `02-concepts.md`            | Non-technical concepts + glossary                          |
| `03-agents.md`              | Agent file format, model policy, starter roster, skills    |
| `04-projects.md`            | Projects, roster, worktrees                                |
| `05-memory.md`              | Global / project / per-agent memory tiers                  |
| `06-usage.md`               | Office floor, summon, history, pipelines, spend, migration |
| `07-interface.md`           | UI feature reference — every tab, modal, hotkey            |
| `08-reference.md`           | API, DB schema, SSE events, architecture, env vars         |

## Editing

- Files are plain markdown with GFM extensions (tables, task lists).
- Callouts use the GitHub / Obsidian `> [!TIP]` / `> [!NOTE]` / `> [!WARN]` syntax.
- Code fences use standard triple-backtick with a language: `\`\`\`ts`.
- Headings determine the right-nav TOC — `##` becomes a top-level anchor,
  `###` becomes a sub-anchor. Slugs are derived from heading text.

## Editing from Obsidian

If you use Obsidian, symlink `apps/web/docs/` into your vault:

```bash
ln -s ~/Documents/Lab/agent-office/apps/web/docs ~/obsidian-vault/Projects/Agent\ Office/app-docs
```

Then edit in Obsidian; changes hot-reload in the running dev server.

## For AI agents editing these files

- Do NOT invent screenshots or feature descriptions. Trace the code first,
  document what actually exists.
- Do NOT introduce placeholder examples (`example.com`, `foo/bar`) when
  the real reference exists in the codebase.
- Keep the section order in each file stable so the right-nav doesn't
  reshuffle unexpectedly.
- When adding a new heading, verify the slug won't collide with an existing
  anchor on the same tab.
