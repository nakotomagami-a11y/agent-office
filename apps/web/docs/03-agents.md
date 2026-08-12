# Agents

Everything about the agents themselves: how they're defined as `.md` files, the frontmatter options, how their system prompt is assembled, the model policy, the bundled starter roster, and the skills system.

## How agents are defined

Each agent is a Markdown file at `~/.claude/agents/<id>.md`. The file has YAML frontmatter (identity, model, tools, skills) followed by a body that becomes the system prompt.

### File layout

```
~/.claude/agents/
├── developer.md              # agent definition
├── developer.memory.md       # optional per-agent memory (sidecar)
├── _global.memory.md         # optional memory injected into every agent
├── _skills/                  # installed skill directories
│   └── <skill>/
│       └── SKILL.md
├── _uploads/<agent-id>/      # file attachments per-agent
└── _archive/                 # archived agents (never loaded)
```

## Frontmatter reference

All fields are optional. Unset fields fall back to app-level defaults.

```yaml
---
name: developer
description: Senior full-stack engineer.
default-model: opus
default-effort: high
skills:
  - webapp-testing
tools:
  - Read
  - Write
  - Edit
  - Bash
permission-mode: bypassPermissions
add-dirs:
  - ~/shared-libs
room: engineering
unit: blue/warrior
---
```

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | string | filename | Display name shown in the UI |
| `description` | string | `""` | Short description shown on agent cards |
| `default-model` | alias | app default | One of: haiku · sonnet · opus · fable. Aliases resolve to the newest published version — see Model policy below. |
| `default-effort` | string | `medium` | Thinking budget: low · medium · high · xhigh · max |
| `skills` | list | `[]` | Installed skills to prepend to every summon |
| `tools` | list | `[]` | Tools the agent may use (`--allowedTools`) |
| `permission-mode` | string | `default` | `default` · `bypassPermissions` · `plan` |
| `add-dirs` | list | `[]` | Extra directories the agent can read/write, passed as `--add-dir` flags |
| `room` | string | `auto` | Which room on the office floor the agent's desk appears in |
| `unit` | string | `auto` | Avatar sprite: `faction/kind` e.g. `blue/warrior` |

### permission-mode values

| Value | Behaviour |
|---|---|
| `default` | Claude Code prompts for permission on destructive actions |
| `bypassPermissions` | All permissions auto-approved — use for trusted automation |
| `plan` | Read-only planning mode — agent cannot write or execute. History note is omitted from the appended prompt. |

## How the system prompt is assembled

When you summon an agent, Agent Office builds an appended prompt passed to Claude Code alongside your message. Composition order is fixed:

1. **Skills** — bodies of all installed skills in the agent's `skills` list, concatenated in order.
2. **Global memory** — contents of `~/.claude/agents/_global.memory.md` — applies to every agent.
3. **Project context** — active project name, working directory, and description.
4. **Project memory** — the memory body from `~/.claude/projects/<id>/project.md`.
5. **Per-agent memory** — contents of `~/.claude/agents/<id>.memory.md`.
6. **History note** — SQLite DB path and a `sqlite3` command so the agent can query its own past runs. Omitted when `permission-mode` is `plan`.

> [!TIP]
> The `.md` body (after the closing `---`) is the `--system-prompt`. The items above are injected as an *appended* prompt, not a replacement.

### Prior context injection

When a run is *not* using `--resume`, the last 8 messages for that agent and instance are fetched from SQLite and prepended to the prompt text as prior context. This gives the agent conversational continuity without requiring an active session ID.

### Plan mode behaviour

When `permission-mode: plan` is set, the history note section is omitted from the appended prompt entirely. This keeps the planning context lean and prevents the agent from accidentally referencing or querying the database in read-only mode.

## Model policy — aliases only

Every `default-model` field uses one of four aliases. Aliases resolve to the newest published version at run time, so a repo pulled today runs the same model an update ships next month.

| Alias | Resolves to | Typical use |
|---|---|---|
| `haiku` | `claude-haiku-4-5` (or newer) | Fast fetches, short summaries, formatting. Not used for development. |
| `sonnet` | `claude-sonnet-4-6` (or newer) | Mechanical dev work, QA, single-file bugfixes, most specialist agents |
| `opus` | `claude-opus-4-8` (or newer) | Feature work, strategic advisors, long-context reasoning |
| `fable` | `claude-fable-5` (or newer) | Maximum-quality autonomous work — human dispatch only (see below) |

### Never pin a version

Do not write `claude-opus-4-7` or any pinned version string in a `.md` frontmatter. Pinned agents silently fall behind aliased peers when Anthropic releases a new version. The agent-architect refuses new designs that pin.

### Fable is user-only

> [!WARN]
> The `fable` model is reserved for direct human dispatch. No agent may summon `developer-fable` (or any future `-fable` variant) via the `Task` tool. Auto-dispatch would let any orchestrator burn through Fable budget without founder consent. If a task genuinely needs Fable-tier reasoning, the calling agent names it in its plan and hands off to the human.

## Starter roster — the bundled agent army

A fresh clone ships 32 agents grouped by role. All use aliased models. All ship with matching skills, tool sets, and explicit refuse lists. Import them from the first-run wizard or via `POST /api/starter/agents`.

### Development tiers

Four tiers from mechanical to maximum. Choose by task scope; each tier refuses work that belongs to a higher one.

| Agent | Model | Use for |
|---|---|---|
| `developer-lite` | sonnet | Dead-code sweeps, dep bumps, single-file bugfixes, boilerplate follow-ups |
| `developer` | opus | Feature work, non-trivial bugfixes, multi-file refactors, judgment calls |
| `developer-fable` | fable | User-dispatch only — long autonomous project work at max quality |
| `planner` | opus | Plan-only — hands off to a builder tier. Splits opus reasoning cost from sonnet execution. |

### Executive advisors (Boardroom room)

| Agent | Owns | Voice |
|---|---|---|
| `cs-ceo` | Vision, board, fundraising, kill/pivot calls | Ruthless, evidence-first, zero fucks |
| `cs-cfo` | Unit economics, runway, capital allocation | Numerate skeptic — models the downside first |
| `cs-cto` | Architecture, tech debt, DORA, build-vs-buy | Roasts overengineering and vibes-based architecture |
| `cs-cpo` | PMF, roadmap, feature-kill, portfolio strategy | *"What job is this feature getting hired for?"* |
| `cs-cmo` | Positioning, ICP, channel mix, brand voice | Roasts feature-list positioning |
| `cs-coo` | Execution, rituals, hiring cadence, OKR discipline | Refuses processes without an owner and metric |
| `cs-boardroom` | Multi-C-suite deliberation for cross-domain calls | Six-phase protocol, decision log |

### Engineering specialists

| Agent | Owns |
|---|---|
| `frontend-craftsman` | Production UI polish — a11y, motion, states, keyboard |
| `designer` | Concept-first pipeline (grill → brief → IA → tokens → tasks) |
| `devops-engineer` | CI/CD, Docker, IaC, GitHub Actions, deploy pipelines |
| `release-engineer` | Cutting releases, changelogs, semver bumps, tags |
| `sre-oncall` | Prod-fire triage, log/trace forensics, runbook execution |
| `security-posture` | Auth, secrets, dependencies, threat modeling — read-only |
| `mcp-builder` | Model Context Protocol servers — tool schemas, transports |

### QA specialists

| Agent | Owns |
|---|---|
| `qa-visual` | Pixel-level defects at multiple viewports |
| `web-qa` | Functional browser QA — clicks, forms, network, console |
| `qa-code-review` | Adversarial diff review — MUST FIX / SHOULD FIX / NIT |
| `qa-pen-testing` | OWASP + prompt injection + secrets probe |
| `qa-codebase` | Static analysis — dead code, unused imports, coverage gaps |

### Support & research

| Agent | Owns |
|---|---|
| `orchestrator` | Breaks down complex tasks, dispatches specialists, synthesises |
| `agent-architect` | Designs new agent `.md` files — grills before drafting |
| `product-manager` | PRDs, story decomposition, RICE/ICE prioritization |
| `tech-writer` | READMEs, ADRs, API references, changelog prose |
| `data-analyst` | SQL over SQLite/Postgres — read-only, shows the query |
| `user-analyst` | Person-portrait from local data (About You tab) |
| `explore` | Read-only code / documentation research, returns briefing |
| `web-researcher` | External web fetch with citations for other agents to reason on |
| `assistant` | General-purpose escape hatch when no specialist fits |

## Skills — reusable capability packs

A skill is a directory at `~/.claude/agents/_skills/<name>/` containing a `SKILL.md` file. When an agent lists a skill, the body of that file is prepended to every summon.

### Skill file format

```markdown
---
name: webapp-testing
description: Browser-based QA using Playwright.
---

## How to test web apps

Use the Playwright MCP server already configured in your environment...
```

### Installing from the registry

Browse and install skill packs from **Settings → Skills** inside the app. The registry indexes packs from multiple GitHub sources and caches them for 1 hour.

Bundled registry sources include:

- `anthropics/skills` — official Anthropic pack
- `tradermonty/claude-trading-skills` — trading community
- `Orchestra-Research/AI-research-SKILLs` — AI/ML research
- `numman-ali/openskills` — community examples

### Skill install provenance

Every skill installed from the registry includes a `.source.json` sidecar at `~/.claude/agents/_skills/<name>/.source.json`. It records the origin for reproducibility and update checks.

```json
{
  "source": "anthropics/skills",
  "ref": "main",
  "path": "browser-automation",
  "sha": "abc123...",
  "installedAt": "2026-05-24T10:00:00.000Z"
}
```

### Registry cache

The registry response is cached for 1 hour in `~/.claude/agents/_skills/_registry.json`. Pass `?refresh=1` to `GET /api/skills/registry` to bypass the cache and fetch fresh data from GitHub.

### Skill conflict warnings

When two selected skills disagree (e.g., one says "always plan first" while another says "act immediately"), the app surfaces a warning above the Skills picker. Compat data comes from `GET /api/skills/compatibility`.

### Cost pills

The Skills picker shows a colored pill next to each skill:

- **green** = low token cost per invocation
- **amber** = medium
- **orange** = high
- **red** = extreme (multi-thousand tokens)

Costs come from the manifest at `GET /api/skills/manifest`. Add cheap skills liberally; think twice before adding red-tier skills to a hot-loop agent.

### Security

Skills are injected into the system prompt verbatim — there is no sandbox. A third-party skill runs with the full tool access configured for the agent. Review skill content before installing packs from unknown sources.

### Writing a local skill

```bash
mkdir -p ~/.claude/agents/_skills/my-skill
cat > ~/.claude/agents/_skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: What this skill teaches the agent.
---

## Instructions

Everything here is injected into the system prompt.
EOF
```

Then reference it in any agent's frontmatter:

```yaml
skills:
  - my-skill
```
