# Agent capabilities audit: what really reaches an agent

Status: **findings only, nothing fixed yet. 49 findings; app-wide sweep running.** Started 2026-10-20 on branch `chat-redesign-audit` (PR #214) against `origin/main` @ `3ff14d4`, Claude Code CLI 2.1.296, Windows.

Why this exists: agents declare tools, MCP servers and skills that silently never reach them. The UI shows them as working. This document lists every such case found so far, with evidence, so the fix can be planned once instead of patched case by case. The app-wide sweep (7 areas) is running and will be appended.

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
| C33 | WASTE | **Four memory systems, three empty**: app global/agent/project memory (all empty), identity files (none exist), CLI auto-memory (empty). The real memory is `NEXT_SESSION.md`, gitignored, diverging copies per worktree, never injected | `~/.claude/agents/*.memory.md` (see S5-17), worktree copies 14.8 KB vs 7.3 KB |
| C34 | WRONG | **Context & Cost doesn't match what's sent**: omits the agent body and listing, assumes a 9k "CC base prompt" that `--agent` replaces, calls the composer without the instance (wrong branch, no worktree), lists `CLAUDE.md` for seats that skip it; the "measured" native figure includes tool output (developer first turns avg 50k, peak 1.7M) | `context-cost.ts:49,54-57,160-171,209,232` |
| C35 | BROKEN | The broadcast route builds the prompt for the worktree but spawns in `req.cwd`, or the server's folder when unset (no caller today) | `routes/broadcast/route.ts:22-50` |
| C36 | WRONG | Docs disagree with the code: global memory called "the machine-wide CLAUDE.md", segment list missing the project map, wrong paths | `README.md:66`, `architecture.md:279-289`, `starter-data/agents/README.md:54`, `agents.ts:9-12` |
| C37 | WASTE | `tmp-prompts/` holds 245 stale prompt files (2.3 MB) | `~/.claude/agent-office/tmp-prompts` |

### Skills

What happens today: frontmatter `skills: [...]` is read by both Agent Office and the CLI with different meanings. Agent Office looks only in `~/.claude/agents/_skills/<name>/SKILL.md`; a body ≤1500 chars is pasted into the appended prompt, larger ones become a one-line "read when needed" pointer, missing ones add nothing. The CLI's native store (`~/.claude/skills`) holds only claude.ai-synced skills. **In 634 runs the DB shows 0 `Skill` tool calls and 0 reads of any `_skills/*/SKILL.md`.**

Declared vs installed, live `~/.claude/agents`: **100 declared, 1 resolves (`developer` → `i-have-adhd`), 99 missing (46 distinct names).** Most-declared missing: `sp-verification-before-completion` ×21, `alz-grill-me` ×6, `pt-ponytail` ×6, `alz-strategic-alignment` ×6, `alz-decision-logger` ×5.

| # | Sev | Finding | Evidence |
|---|---|---|---|
| C38 | BROKEN | **99 of 100 declared skills reach no agent, and the bundled starter agents ship that way.** Starter agents declare `alz-*`, `sp-*`, `pt-*`, `ecc-*`, `jul-*`, `imp-*`, `an-*` names from an external pack that isn't in the repo; `starter-data/skills` has only 4 unprefixed skills no starter agent declares | `apps/web/starter-data/agents/*.md`, `starter-data/skills`, `skills.ts:882` |
| C39 | BROKEN | **The prefixed names can't be installed from the app**: registry installs keep upstream names (`webapp-testing`, not `an-webapp-testing`); project templates use unprefixed names, so templates and starter agents disagree | `templates.ts:23,75` |
| C40 | BROKEN | **20 registry skills can't be installed**: name clashes get an `@source` suffix, which the install schema's `^[A-Za-z0-9._-]+$` rejects | `skills.ts:268-283`, `api-contract/src/schemas.ts:167` |
| C41 | BROKEN | **The one installed skill is never applied**: `i-have-adhd` (7,010 chars) becomes a "read when needed" pointer; its `always-inline: true` and native `disable-model-invocation` are ignored; no run ever read it; it duplicates the built-in response style | `skills.ts:769-774,817`; commit `739633b` |
| C42 | BROKEN | **Account folders get their own empty `skills/` and `plugins/`**: `SHARED_ASSETS` lists them, but the never-clobber rule skips linking once the CLI created real dirs; 386 of 645 runs ran under an account folder | `accounts.ts:35-43,156-157` |
| C43 | WRONG | **The UI shows missing skills as equipped**: editor cards, detail tags, quick view, Memory tree. `unresolvedSkills` exists but has no caller. "7 of 6 slots" (`SKILL_SLOTS = 6` is cosmetic) | `agent-editor-form.tsx:127,253-335`, `agent-detail.tsx:64-66`, `skills.ts:867-873` |
| C44 | WRONG | **Skill cost badge doesn't match what a run pays** (`size/4`, e.g. claude-api "~8k" vs a ~60-token pointer); customizing a large skill flips it to fully inlined | `skill-weight.ts`, `skills.ts:817` |
| C45 | WRONG | Skill section toggles look per-agent (Memory page) but apply to every agent | `scope.ts:31`, `memory-nav.tsx:120-140`, `skills.ts:639-650` |
| C46 | WASTE | Manifest and compatibility features are dead (files don't exist, `useSkillCompatibility` has no callers, routes always return null); quick-view token cost never renders | `skills.ts:880-907`, `agent-quick-view.tsx:175-179` |
| C47 | WASTE | Guard tests test nothing: they run against an empty temp home, so the skills checks return early; no test checks starter agents' skills resolve — how C38 shipped | `agent-surface.test.ts:59-70,100-108` |
| C48 | WASTE | `boot.ts` defines its own `SKILLS_DIR` from `homedir()`, bypassing the `paths.ts` real-home test guard; `PRE_MARKER_BUNDLE` is a hard-coded legacy list | `boot.ts:37,71` |
| C49 | WRONG (latent) | Double loading once a name exists in both stores: subagents would get the CLI's native preload plus the app's copy | CLI subagent preload |

Open: whether CLI 2.1.296 preloads frontmatter `skills:` for a main `--agent` run (it does for subagents). One probe settles it.

## Overlap with PR #212 (AI providers mission)

PR #212 changes 195 files. It shares these with the capability pipeline: `services/execution/summon.ts`, `execution/runs.ts`, `execution/runs/spawn-env.ts`, `accounts/accounts.ts`, `accounts/secrets.ts`, `accounts/secret-crypto.ts`, `agents/context-cost.ts`, `agents/context-cost-measure.ts`, `infra/paths.ts`, `db/runs.ts`, and the Context & Cost tab. A test merge of #212 into #214 today has **one** conflict (`execution/runs.ts`).

Rule for the fixes: anything in those files waits for #212 to merge, or is coordinated with its seats. Fixes in agent files (`~/.claude/agents`, `starter-data/agents`), `starter-data.ts`, skills, tool catalog, history, project map and the web UI can go first.

## Next

1. ~~Finish the skills audit~~ (done: C38–C49).
2. A wider sweep of the rest of the app with the same lens (does it reach the agent or user, does it make sense, does it work on Windows), excluding #212's files.
3. One fix plan, ordered so the root causes go first: move app files out of `~/.claude/agents` (C1, C2), one config folder story (C5–C7), a generated tool catalog checked against live init events (C9–C15), session-fixed context with one source per concern (C24–C34).

## App-wide sweep (2026-10-20)

Same lens across the rest of the app: does it reach the agent or the user, does it make sense, does it work on Windows, does the UI tell the truth. PR #212's 195 files are excluded; findings that touch them are marked **#212**.

### S3 · Missions and QA loops

Earlier live-mission findings F1–F4 (in `chat-redesign-audit.md` context) all still hold: claim Accept only in the pill dropdown; seat chats created empty before Accept; `supersedes` parsed but never acted on (agents are never even told the field exists, `protocol.ts:115-122`); several open asks for one decision.

| # | Sev | Finding | Evidence |
|---|---|---|---|
| S3-1 | BROKEN | A non-question post addressed to the human (`result`, `blocker`) is lost; only question/human-task/decision-request become open items; `forHuman` is computed and never read | `state.ts:62,167`, `routing.ts:43-46`, `poller.ts:138` |
| S3-2 | WRONG | The coordinator never hears about claims, accepts, pauses, evictions or close, so "roll call when every seat is ✅" can't be event-driven | `routing.ts:41`, `protocol.ts:135` |
| S3-3 | WASTE | The welcome tells seats to "read the hub" while forbidding `gh api`; agents read the whole thread the digest exists to avoid | `protocol.ts:135` |
| S3-4 | WRONG | A ruling to a coordinator whose chat needs attention is queued silently; the hub records the decision and the ask disappears everywhere | `human-acts.ts:54-61`, `conversation-machine.ts:110-112` |
| S3-5 | WRONG | Open asks from a seat that left stay open forever | `state.ts:146-153` |
| S3-6 | WASTE | A hub PR merged/closed on GitHub without a `close` post keeps seats active and is polled every 30 s forever | `hub.ts:143-146`, `actions.ts:61-68`, `poller.ts:77-107` |
| S3-7 | WRONG | QA-loop reviewer runs on a seat count as the seat's: charged to its cap, their text parsed as the seat's hub posts | `loop-production-runner.ts:25-31`, `posting.ts:59-63` |
| S3-8 | WRONG | Loop "Stop" / "Accept as-is" only change stored state; the reviewer (or fix round) keeps running and spending | `loop-machine.ts:207-212`, `loop-runner.ts:170,187` |
| S3-9 | BROKEN | QA loop toggle does nothing on mission seats (loops start only after a human-typed turn) but is shown there | `qa-loop.ts:68`, `agent-details/index.tsx:441` #212 |
| S3-10 | WRONG | With QA loop on, turns are silently not reviewed when a message is queued, the chat isn't idle, another loop runs, or edits went through Bash; a missing reviewer only logs | `qa-loop.ts:72-82`, `config/loop.ts:22` |
| S3-11 | WRONG | A loop review runs outside the chat, so the chat looks idle and a new turn can change the worktree mid-review | `poller.ts:32-35` |
| S3-12 | WRONG | UI text: claims accepted "from their Missions window" (it's the pill); close "stops every seat on every device" (only routing on next poll) | `en.json:1085,1140` #212 |
| S3-13 | WASTE | Joining by PR link reads every open hub in the project then filters client-side | `views.ts:48-73`, `mission-join-list.tsx:108,117` |
| S3-14 | WRONG | `docs/missions.md` out of date in 7 places (status, owned paths, join flow, promised cards/badges, seat chat id, template) | #212 |
| S3-15 | WRONG | Nearly every human answer reaches other devices labelled "unverifiable", ranking it below the seat's brief | `protocol.ts:160`, `routing.ts:39` |
| S3-16 | WRONG | A rejected/evicted seat's pill vanishes with no notice; the empty chat and worktree stay | `poller.ts:126-129` |

### S5 · Settings, memory, skills UI

Every user-facing setting was traced to its reader. Most work; these don't:

| # | Sev | Finding | Evidence |
|---|---|---|---|
| S5-1 | BROKEN | **"Delete folder" always fails on Windows** when the projects root starts with `~/` (mixed slashes fail the inside-root check); `~\foo` roots aren't expanded, so the scan is silently empty | `paths.ts:151`, `projects.ts:482-484` #212 |
| S5-2 | BROKEN | **Delete/Shelve can hit a different real folder**: the pane lists folders under the unsaved root but the server resolves the slug under the saved root; two folders with the same slug collide | `settings-page.tsx:77`, `projects.ts:476-478` #212 |
| S5-3 | BROKEN | "Match my power source" (on by default) does nothing on Windows/macOS: `/api/power` reads only Linux `/sys` | `routes/power/route.ts:10,22-25`, `power-sync.tsx:61-66` |
| S5-4 | WRONG | Performance tab's mode table is wrong (planet icons, framer-motion), its "override any row" has no control, dev console mentions a removed cards view | `performance-tab.tsx:44`, `performance.css:42-46`, `dev-menu.tsx:444` |
| S5-5 | BROKEN | Cleanup → "Chat transcripts" empties the retired `transcripts` table (0 rows; chat uses `conversations`); project export "include history" reads the same table, so it's always empty | `cleanup.ts:56-60`, `save.ts:59-66` |
| S5-6 | WRONG | **Cleanup → "Skill install cache" deletes the user's own skills** ("they reinstall on next use" — only bundled ones, only at next server start) | `cleanup.ts:122-131`, `boot.ts:64-67` |
| S5-7 | WRONG | Cleanup → "App UI settings" wipes every UI key incl. the office map (44 KB), decorations, wizard draft | `cleanup.ts:137-143` |
| S5-8 | BROKEN | The limits modal is never mounted; its store stays at defaults, so the office budget line never shows and the resume menu always guesses "next Monday" | `claude-limits-modal.tsx:272-273`, `schedule-resume-menu.tsx:29-33`, `rate-limit-card.tsx:75-88` #212 |
| S5-9 | WRONG | `features.multiInstance` has no UI; off by default, a second copy of an agent shares the checkout with no worktree (only logged); docs describe it wrongly | `projects.ts:535-543`, `docs/07-interface.md:257` |
| S5-10 | WRONG | Turning GitHub integration off still injects the GitHub identity and the "git push authenticates as X" line; the picker spins forever | `spawn-env.ts:78-97`, `agents.ts:298-304` #212 |
| S5-11 | BROKEN | Memory page "Docs" tab has no reader and no writer (no agent sees it); CRLF breaks its header parser | `memory/page.tsx:36`, `docs.ts:39,120,153` |
| S5-12 | BROKEN | About You: the analyst agent's main source is `sqlite3` (not installed); a failed run never shows as failed; cost hint hard-coded; no agent reads the report | `user-analyst.md:136-142`, `about-you-tab.tsx:30,56-75` |
| S5-13 | WRONG | **Secrets tab says "encrypted at rest" but every tab switch writes the active project's secret values in plain text to `shell-env.sh`** (a zsh hook; `0o600` is meaningless on Windows; the `source` line doesn't work in Git Bash) | `secrets-tab.tsx:64`, `shell-env.ts:8,113-118` |
| S5-14 | WRONG | Exclusions are exact top-level folder names, but the UI calls them patterns and the wizard says "any depth"; defaults list dot-folders already skipped | `settings.ts:94-101`, `use-settings.ts:28` #212 |
| S5-15 | WRONG | "Saved" stays visible after later edits in the Projects pane | `settings-page.tsx:68,145` #212 |
| S5-16 | WRONG | Office nav entry stays when the iso view is unavailable and silently redirects | `page.tsx:39-42` |
| S5-17 | WASTE | Memory files live in `~/.claude/agents/` (the CLI's agent folder), not `~/.claude/agent-office/` as C33 says | `agents.ts:244`, `paths.ts:40` |

### S1 · Agents, roster, sessions, worktrees

| # | Sev | Finding | Evidence |
|---|---|---|---|
| S1-1 | BROKEN | **The installed app and the dev checkout downgrade each other's agents**: the roster update only checks `installed !== bundle`, not which is newer. The installed build (`2026-10-06-1`) overwrote the newer `2026-10-11-1` agents; 8 agents (all cs-*, qa-code-review, user-analyst) run old text | `agent-migration-trigger.tsx:51`; `agent-manifest-version`; `_archive/cs-ceo.pre-2026-10-06-1-backup.md` |
| S1-2 | WRONG | "Updated" can't tell a local edit from a bundle change (hash compare only, no install record, no diff); accepting reverts local edits into `_archive/` (C1) | `starter-data.ts:248-267`, `bundled-agents-tab.tsx:163` |
| S1-3 | WRONG | "Remind me later" re-shows the modal every launch (skips ignored); the first-run wizard never records the version, so declined agents come back pre-checked | `agent-migration-modal.tsx:50-54`, `first-run-wizard.tsx:191-197` #212 |
| S1-4 | BROKEN | On the installed Windows build the wizard shows all 34 starter agents with no name/description: CRLF files vs a `^---\n` parser | `starter-data.ts:67` |
| S1-5 | BROKEN | **Saving an agent drops `add-dirs`** (and any unknown field); the chat header's model/effort picker rewrites the whole file and changes the model for every session in every project | `schemas.ts:6-23`, `agents.ts:130-155`, `agent-details/index.tsx:146-155` #212 |
| S1-6 | BROKEN | **"Forge agent" silently overwrites an existing agent** (POST is create-or-overwrite, no backup; name "Developer" → `developer.md`) | `routes/agents/route.ts:12-17`, `agent-editor-form.tsx:422` #212 |
| S1-7 | WRONG | Per-session model/effort/permission overrides are stored and spawned but nothing can set them; model/effort are unvalidated strings passed to `--model` | `schemas.ts:145-156` |
| S1-8 | BROKEN | **Parallel sessions share the main checkout.** Worktrees need `features.multiInstance` (off, no UI) and even then the first session uses the main checkout. 25 `developer` sessions ran in the main checkout, overlapping in time (e.g. 7 overlaps between two sessions); the docs call per-session worktrees "the standout" | `projects.ts:534,543`, DB, `docs/00-features.md:46` |
| S1-9 | BROKEN | Startup worktree clean-up never matches on Windows (`C:\` vs git's `C:/`); on macOS/Linux it force-removes **any** worktree under `.worktrees/` that isn't a session, including hand-made ones with uncommitted work | `worktrees.ts:309,321` |
| S1-10 | WRONG | Removing a session force-deletes its worktree and branch with no run check and no warning (mission seats lose unpushed work) | `worktrees.ts:218,232`, `en.json:175,471` #212 |
| S1-11 | WRONG | An unrepairable worktree silently falls back to the main checkout for good; a mission seat without its branch quietly gets a fresh branch off HEAD; the computed "worktree missing" flag has no reader | `projects.ts:812-849`, `worktrees.ts:111` |
| S1-12 | BROKEN | Project export "include history" exports nothing (reads the retired `transcripts`); import overwrites agents and memory with no backup | `save.ts:62,86-87,127` |
| S1-13 | BROKEN | "Delete project folder" always fails on Windows (same as S5-1) | `paths.ts:151`, `projects.ts:481-484` |
| S1-14 | WASTE | Unused endpoints: `/api/templates` (templates also invalid and colliding), `/api/agents/bulk`, `PUT /api/agents/:id/body` (would wipe CRLF headers), body-history routes (each save writes `<id>.body.<ts>.md` into the CLI's agent folder) | `templates.ts`, `body/route.ts:43` |
| S1-15 | WASTE | `resolveStarterDataDir` ×3, agent-file filter ×2, stale header comment | `starter-data.ts:4,42,227`, `boot.ts:38`, `project-bootstrap.ts:80`, `agents.ts:113` |
| S1-16 | WRONG | Docs on sessions are wrong: caps (8/24 vs code 5/10), worktree rules, leftovers "archived" (code force-deletes), a file that doesn't exist; identity files "travel alongside" (they don't) | `docs/06-usage.md:113-140`, `docs/07-interface.md:257` |
| S1-17 | WRONG | Deleting an agent leaves its sessions in `project.md` (hidden), worktrees uncleaned; session numbers shift after a removal; non-409 spawn errors swallowed | `use-roster-display.ts:48-56`, `use-spawn-instance.ts:38` |
