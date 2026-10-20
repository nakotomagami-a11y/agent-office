# Agent capabilities audit: what really reaches an agent

Status: **findings only, nothing fixed yet.** Started 2026-10-20 on branch `chat-redesign-audit` (PR #214) against `origin/main` @ `3ff14d4`, Claude Code CLI 2.1.296, Windows.

Why this exists: agents declare tools, MCP servers and skills that silently never reach them. The UI shows them as working. This document lists every such case found so far, with evidence, so the fix can be planned once instead of patched case by case. The skills audit is still running and will be appended.

How it was checked:
- **Live probes.** All 34 agent definitions were started exactly the way Agent Office starts them (`claude -p --agent <id> --output-format stream-json --verbose`), the CLI's `system/init` event was read (it lists tools, MCP servers, skills, agents, memory paths) and the process was killed before any model call.
- **Measured runs.** Token cost of MCP tools was measured with real `--agent` runs (haiku, a fake 25-tool server).
- **Recorded sessions.** The CLI stores the exact system prompt of each session (`prompt_snapshot` in `~/.claude/projects/<cwd>/<session>.jsonl`); real `developer` sessions were compared to the agent files.
- **Code and data.** Three read-only audits of the code (MCP/tools, context layering, skills) and Agent Office's DB.

Severity: **BROKEN** = a capability doesn't reach the agent or silently fails. **WRONG** = works, but misleads or contradicts itself. **WASTE** = dead, duplicated or costly for nothing.

## The five root causes

Most findings below come from five design decisions made before the end product was clear:

1. **Agent Office stores its own files inside the folder the CLI scans for agents.** Backups (`~/.claude/agents/_archive/`) and skills (`~/.claude/agents/_skills/`) are read by the CLI as agent definitions. → C1, C2.
2. **Each account gets its own Claude config folder** (`CLAUDE_CONFIG_DIR=~/.claude/agent-office/accounts/acc_*/`), but Agent Office's own code reads `~/.claude.json` and `~/.claude/settings.json`. Anything configured the normal way (`claude mcp add`, `~/.claude/CLAUDE.md`, `~/.claude/settings.json`) does not reach agents, and the app reads the wrong files. → C3, C4.
3. **Agent `tools:` lists are strict whitelists**, and they were hand-edited without a check against what the CLI actually provides. → C5–C8.
4. **The context the app adds was built per turn, but the CLI freezes the system prompt per session**, and several layers duplicate what the CLI already loads. → C10–C16.
5. **No feedback loop.** Every mismatch is either logged to `server.log` only or not detected at all, and the Context & Cost tab estimates from a different spawn plan than the real one. → C9, C17.

## Findings

### Agent definitions and discovery

| # | Sev | Finding | Evidence |
|---|---|---|---|
| C1 | BROKEN | **Agents run an archived copy of themselves.** Backups go to `~/.claude/agents/_archive/<id>.pre-<ver>-backup.md` and keep `name: <id>`; the CLI scans subfolders and picks the archive. Every edit to `developer` since 2026-10-06 was ignored. | `apps/server/src/lib/starter-data.ts:24,350`; the recorded system prompt of two developer sessions is 5,544 chars and matches the archive byte for byte; the live file is 5,645 |
| C2 | BROKEN | **Skills are registered as agents.** `~/.claude/agents/_skills/` is inside the scanned folder, so `claude-api`, `frontend-design`, `i-have-adhd`, `web-artifacts-builder` and `webapp-testing` appear in every agent's list of spawnable agents, each "with all tools" | `paths.ts` `SKILLS_DIR`; `agent_listing_delta` in session transcripts; `init.agents` lists 44 types |
| C3 | WRONG | **Two Explore agents.** A user agent `explore` (Read, Bash) and the built-in `Explore`; runs are recorded under both | DB: `explore` ×31, `Explore` ×9 |
| C4 | WRONG | **Agent bodies contradict what the app injects**: `MAIN=/path/to/agent-office` sync scripts (5 agents and shipped `starter-data/agents/developer.md`), `NEXT_SESSION.md` handoffs written into worktrees and never read, "Skills loaded" sections naming skills that aren't installed, `nohup … &` advice duplicating the Bash tool's `run_in_background` | developer, devops-engineer, product-manager, release-engineer, tech-writer, designer, frontend-craftsman, developer-lite, developer-fable, level-designer, tech-animator, orchestrator |

### Config folders and accounts

| # | Sev | Finding | Evidence |
|---|---|---|---|
| C5 | BROKEN | **Normal Claude config never reaches agents.** Each account folder has its own `.claude.json` (MCP servers), `settings.json` and `skills/`; only `agents/` is linked to `~/.claude`. `claude mcp add` in a terminal, `~/.claude/CLAUDE.md` and `~/.claude/settings.json` all miss agents | `accounts.ts:32-43`; init `memory_paths` points into `accounts/acc_*`; both account folders have empty MCP config |
| C6 | BROKEN | **The app reads the wrong account's config.** `readGlobalMcpServers` (mission seats) and `readMcpServerConfigs` (Context & Cost) read `homedir()/.claude.json`, not the run's account folder | `summon.ts:63-71`, `context-cost-measure.ts:97-111` |
| C7 | WRONG | **Account folders share settings unreliably**: `CLAUDE.md` linked only if it existed at link time; `settings.json` is a hard link that an atomic save breaks; `skills/` is a real folder | `accounts.ts:35-43` |
| C8 | WASTE | The prompt's env block carries billing info ("Claude account: Default (max plan)"); after an account switch the frozen prompt names the old account | session d4c3b73f |

### Tools

Live result for all 34 agents: tool counts range from 2 to 7; no agent has `Skill`, `Glob`, `ToolSearch` or `PowerShell`; only `level-designer` and `tech-animator` have `Grep`.

| # | Sev | Finding | Evidence |
|---|---|---|---|
| C9 | BROKEN | **7 agents declare MCP tools for servers that exist nowhere**, and the CLI drops them silently: `mcp__playwright__*` (designer, developer, frontend-craftsman, qa-visual, web-qa), `mcp__unreal-mcp__*` + `mcp__blender__*` (level-designer, tech-animator — their core tools) | live init events; no MCP server in any scope or account |
| C10 | WRONG | **Grep and Glob were removed from shipped agents and never restored.** #134 wrongly declared they don't exist, #152 removed `Grep` from 30 agents, #174 fixed the tool list but not the agents. Code and QA agents search with Bash only | `5f1ec3b`, `1e2fc16`, `9914d83`; `starter-data-tools.test.ts:7-11` |
| C11 | BROKEN | **No agent can use the 28 native skills** the CLI offers (built-ins and `anthropic-skills:*`): none has the `Skill` tool | live init: `skills` lists 28, `tools` never has `Skill` |
| C12 | WRONG | **`assistant` ("full tool access") gets 4 tools.** `claude` is described "Tools: *" too | live init |
| C13 | WRONG | **The known-tools list is out of date for CLI 2.1.296**: has `TaskCreate/Get/List/Update` (absent in `-p`, and the retired-tool hint points to them), lacks `Agent` (the name the model actually calls: 22 calls in the DB) | `config/tools.ts:27-73` |
| C14 | WASTE | **Three hand-typed tool lists disagree**: `docs-export.ts` (`LS`, `TodoRead`, `TodoWrite`, `mcp__chrome-devtools__*`), the agent editor's suggestions (offers `TodoWrite`, omits `Agent`, `ToolSearch`, `WebSearch`, `PowerShell`), `docs/03-agents.md:225` ("the Playwright MCP server already configured") | `docs-export.ts:759-782`, `agent-editor-form.tsx:62-72` |
| C15 | WRONG | **Unknown or retired tools are only logged** (`log.warn` to `server.log`), never shown | `agents.ts:349-358` |
| C16 | WRONG | Every agent whitelists `Bash`, never `PowerShell`. On Windows without Git Bash an agent has no shell at all (not verified) | all agent files |
| C17 | WRONG | QA verdict lookup matches `name LIKE '%ReportFindings'`, so an MCP tool of that name or a sub-agent's call counts as the reviewer's verdict; `qa-code-review` delegates to three agents that don't exist | `loop-findings.ts:72-73` |

### MCP servers

Measured with `--agent` (input tokens per run, haiku):

| Agent setup | Tokens |
|---|---|
| Tools [Read, Bash], no MCP server | 3,261 |
| Same, a server configured but not in the tool list | 4,218 |
| Tool list includes a 25-tool MCP server | **12,018** (+7,800) |
| Same plus `ToolSearch` | **5,137** (+900) |
| No tool list (every built-in tool) | 29,904 |

| # | Sev | Finding | Evidence |
|---|---|---|---|
| C18 | WRONG | **MCP tools cost ~310 tokens each per run for agents**, because no agent has `ToolSearch` (which defers schemas). Adding `ToolSearch` cuts a 25-tool server from +7,800 to +900. The earlier "~300 tokens per server" in `chat-redesign-audit.md` was measured without `--agent` and is wrong | table above |
| C19 | BROKEN | **The Playwright header toggle controls a server that doesn't exist**, and its tooltip promises to keep the server out of the spawn. `--disallowedTools` filters tools only: a disallowed server still starts | `agent-details/index.tsx:158-163,407`; `en.json:432`; measured `fake: connected` while disallowed |
| C20 | WRONG | **Context & Cost MCP estimate is wrong**: reads only user scope of the wrong file, spawns servers without their `env`, counts full schemas, and its comment says developer calls Playwright "thousands of times" (no server exists) | `context-cost-measure.ts:13-15,97-139`; `context-cost.ts:276` |
| C21 | WRONG | **Mission seats put every user-scope server config, keys included, on the command line** (`--mcp-config '<json>'`), visible to other processes and limited to ~8 KB by cmd.exe | `summon.ts:60-81`, `runs.ts:13-15` |
| C22 | BROKEN | `luma/.mcp.json`'s `lumagit` server loads in agent runs but fails to start | live init: `lumagit: failed` |
| C23 | WRONG | claude.ai connectors are erratic in agent runs: 2 of 10 appear; Claude Docs is usually still "pending" at start | live init |

### Context and memory

What reaches `developer` today, from a recorded session: agent body 1.4k tokens → app-appended prompt 2.1k (78% of it response style) → tool schemas 6.8k (`SendMessage` alone 2.5k) → agent listing 4.2k (5 fake agents) → project `CLAUDE.md` 0.8k (normal runs only).

| # | Sev | Finding | Evidence |
|---|---|---|---|
| C24 | WRONG | **Prompt changes never reach a running conversation.** The app rebuilds the appended prompt every turn, but the CLI freezes the system prompt for the session until compaction; one session kept "1199 uncommitted files" for 180 turns | `summon-run.ts:82`; CLI `--system-prompt-snapshot`; session d4c3b73f |
| C25 | BROKEN | **The history note tells agents to run `sqlite3`, which isn't installed**, and its condition is inverted: sent on resumed turns (which already have history), omitted on fresh starts | `history.ts:137-145`, `agents.ts:473-484`, `summon-run.ts:36` |
| C26 | WRONG | **"New thread" isn't clean**: a session-less send prepends the last 8 messages of the same agent across all conversations; the one case that needs it (retry after "No conversation found") gets none | `summon-run.ts:35-47`, `db/messages.ts:35-66`, `runs.ts:234-241` |
| C27 | WASTE | The context profile (tight/balanced/deep) has no UI and is always "balanced"; deep search and `PROFILE_TOK` are unused | `composer-config.ts:14-21`, `history.ts:8-12` |
| C28 | WASTE | **Response style is sent twice** for agents that also declare `i-have-adhd` (6.6k + pointer); it's a personal preference hard-coded in product code, with a hard-coded opt-out list | `config/response-style.ts`, `agents.ts:32` |
| C29 | WRONG | `INLINE_MAX_CHARS=1500` ignores a skill's own `always-inline: true` | `skills.ts:774,817` |
| C30 | WRONG | "Active project" gives the main checkout as cwd for worktree agents | `agents.ts:418` |
| C31 | WASTE | **Project map duplicates `CLAUDE.md`** (layout, commands, "read before"), freezes a changing git count, tells mission seats to read a `CLAUDE.md` they deliberately don't load; `project-map-file.ts` (a `CLAUDE.md` writer) is dead code | `project-map.ts:94-123`, `docs/missions.md:196-201` |
| C32 | WRONG | **Sub-agents get none of the app's layers** (skills, style, project facts, memory): only their `.md` body | CLI behaviour for `Agent`/`Task` |
| C33 | WASTE | **Four memory systems, three empty**: app global/agent/project memory (all empty), identity files (none exist), CLI auto-memory (empty). The real memory is `NEXT_SESSION.md`, gitignored, diverging copies per worktree, never injected | `~/.claude/agent-office/*.memory.md`, worktree copies 14.8 KB vs 7.3 KB |
| C34 | WRONG | **Context & Cost doesn't match what's sent**: omits the agent body and listing, assumes a 9k "CC base prompt" that `--agent` replaces, calls the composer without the instance (wrong branch, no worktree), lists `CLAUDE.md` for seats that skip it; the "measured" native figure includes tool output (developer first turns avg 50k, peak 1.7M) | `context-cost.ts:49,54-57,160-171,209,232` |
| C35 | BROKEN | The broadcast route builds the prompt for the worktree but spawns in `req.cwd`, or the server's folder when unset (no caller today) | `routes/broadcast/route.ts:22-50` |
| C36 | WRONG | Docs disagree with the code: global memory called "the machine-wide CLAUDE.md", segment list missing the project map, wrong paths | `README.md:66`, `architecture.md:279-289`, `starter-data/agents/README.md:54`, `agents.ts:9-12` |
| C37 | WASTE | `tmp-prompts/` holds 245 stale prompt files (2.3 MB) | `~/.claude/agent-office/tmp-prompts` |

### Skills

Pending: the skills audit is still running. Already known: C2, C11, C28, C29; of `developer`'s 5 declared skills only `i-have-adhd` is installed.

## Overlap with PR #212 (AI providers mission)

PR #212 changes 195 files. It shares these with the capability pipeline: `services/execution/summon.ts`, `execution/runs.ts`, `execution/runs/spawn-env.ts`, `accounts/accounts.ts`, `accounts/secrets.ts`, `accounts/secret-crypto.ts`, `agents/context-cost.ts`, `agents/context-cost-measure.ts`, `infra/paths.ts`, `db/runs.ts`, and the Context & Cost tab. A test merge of #212 into #214 today has **one** conflict (`execution/runs.ts`).

Rule for the fixes: anything in those files waits for #212 to merge, or is coordinated with its seats. Fixes in agent files (`~/.claude/agents`, `starter-data/agents`), `starter-data.ts`, skills, tool catalog, history, project map and the web UI can go first.

## Next

1. Finish the skills audit and append it.
2. A wider sweep of the rest of the app with the same lens (does it reach the agent or user, does it make sense, does it work on Windows), excluding #212's files.
3. One fix plan, ordered so the root causes go first: move app files out of `~/.claude/agents` (C1, C2), one config folder story (C5–C7), a generated tool catalog checked against live init events (C9–C15), session-fixed context with one source per concern (C24–C34).
