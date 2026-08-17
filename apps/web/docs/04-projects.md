# Projects

How a project pairs a directory on disk with a roster of agents: the metadata file, worktree isolation, project memory, uploads, and the actions you can run against the codebase.

## Scoping agents to a codebase

A project pairs a directory on disk with agent instances. Instances share the project directory as their `cwd`, but each gets its own `.worktrees/<agent>-<random>` scratch dir so agents don't collide.

### Project metadata file

Each project has a metadata file at `~/.claude/projects/<id>/project.md`:

```markdown
---
id: acme-web
name: Acme Web
description: The main marketing site.
cwd: ~/code/acme-web
roster:
  - agent: developer
    instance: developer-3f9a
    label: main
    unit: blue/warrior
  - agent: qa-visual
    instance: qa-visual-b2c1
---

# Project memory

Any prose here is injected as the project memory when any instance runs.
```

Anything after the closing `---` is the **project memory** (see [Memory](#/memory)).

### Roster instance fields

| Field | Purpose |
|---|---|
| `agent` | Slug of the agent definition to instantiate. |
| `instance` | Unique ID for this instance (auto-generated on drop). |
| `label` | Optional human-readable name — shown next to the avatar. |
| `unit` | Optional avatar override — `faction/kind`. Defaults derived from agent slug. |
| `model` | Optional per-instance model override. Uses the agent default if unset. |
| `effort` | Optional per-instance effort override. |
| `worktree` | Path of the git worktree created for this instance. Auto-cleaned on removal. |

### Worktree isolation

When a project directory is a git repo, each rostered instance gets its own worktree at `<projectRoot>/.worktrees/<agent>-<instance>`. Agents write there; the human syncs to the main checkout at the end of each task via the sync script embedded in the agent body (see [Concepts → Worktree](#/concepts) for why).

If the project directory is NOT a git repo, the instance runs directly in `cwd` — no worktree isolation. Multiple non-git instances SHOULD be avoided to prevent conflicting edits.

### Project memory

The project memory tier is written to the same `project.md` file after the closing frontmatter. Edit from the app's **Project Memory** page or in your editor of choice. Maximum size is 256 KB.

### Uploads

Files attached to any run for the project are stored at `~/.claude/projects/<id>/_uploads/`. Available at `GET /api/projects/:id/uploads`.

### Secrets

A secret is a named environment variable (e.g. `OPENAI_API_KEY`) with its value, injected into every run for the projects it's attached to. Define a secret once and link it to as many projects as you need.

Manage secrets from the **Environment bar** on the project detail page, alongside the Claude and GitHub account pickers.

| Field | Purpose |
|---|---|
| `name` | The exact env var name injected into the run. |
| `value` | The token. Encrypted at rest (AES-256-GCM) with a machine-local key; same-machine trust model as the gh and Claude credentials already on disk. |
| `expires_at` | Optional expiry timestamp, surfaced as a warning in the UI. |
| `test_cmd` | Optional shell command to check the value is live. |
| `verify_before_run` | When set, the test command runs before each summon; a failure blocks the run. |

| Action | Endpoint |
|---|---|
| List / create secrets | `GET` / `POST /api/secrets` |
| Update / delete a secret | `PUT` / `DELETE /api/secrets/:id` |
| Test a secret | `POST /api/secrets/:id/test` |
| List / attach for a project | `GET` / `POST /api/projects/:id/secrets` |
| Detach from a project | `DELETE /api/projects/:id/secrets/:secretId` |

### Git status widget

A compact git status shows on the Project card **and** on the Office header's project chip: current branch, ahead/behind arrows (`↑`/`↓` vs upstream), and an uncommitted-file count (`·N`). Data comes from `GET /api/projects/:id/git-status`, polled every 30s.

- **Branch** — `git rev-parse --abbrev-ref HEAD` in the project's `cwd` (the base checkout, not the per-agent worktrees).
- **`·N`** — changed-file count from `git status --porcelain --untracked-files=all`, so it **includes untracked files and matches VS Code's Source Control badge**. (The `+N` / `-N` line churn on the project detail page is separate — that comes from `git diff --shortstat`, tracked lines only.)

### Actions

The project detail page exposes buttons that shell out to the terminal:

| Action | Endpoint | What it does |
|---|---|---|
| Open folder | `POST /api/projects/:id/open-folder` | `xdg-open` the project directory |
| Dev server | `POST /api/projects/:id/dev` | Detects available package managers + dev script, spawns in a terminal |
| Build | `POST /api/projects/:id/build` | Runs the build script in a terminal |
| Install | `POST /api/projects/:id/install` | Runs `pnpm/npm/yarn install` |
| Clear cache | `POST /api/projects/:id/clear-cache` | Wipes `.next/`, `dist/`, `.turbo/` |

Any process launched this way is captured by the Processes panel (see [Usage](#/usage)).
