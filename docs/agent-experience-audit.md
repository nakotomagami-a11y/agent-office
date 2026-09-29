# Agent Experience Audit

> **Status:** findings only — nothing in here is implemented yet.
> **Date:** 2026-09-29
> **Scope:** the whole app, read from the agent's side of the glass.
> **Method:** source reading + execution. Every claim below is backed by a file
> reference or a command whose output is quoted. Where I only *suspect*
> something, I say so.

---

## 0. The design principle this audit is written against

> **Give an agent a map, not a 1000-page instruction manual.**

A **map** is compact, structural, and navigable: it says *what exists, where it
lives, and how to get more*. It costs a few hundred tokens and stays true as the
project grows.

A **manual** is procedural prose the agent must carry in context on every single
turn whether or not the task touches it. It costs thousands of tokens, goes
stale silently, and competes with the actual work for attention.

The distinction matters because **an agent's context is its working memory, and
we are its landlord.** Every token we spend on a procedure that doesn't apply to
this turn is a token the agent can't spend on the user's problem.

This app already implements map-not-manual correctly in **exactly one
subsystem** (skills — see §3.1) and nowhere else. That's the central finding.
Most of this document is "apply the thing you already built, everywhere else."

---

## 1. Executive summary

Agent Office is, today, **a human's observation deck for watching agents work**,
not an environment agents work *in*. The drift is visible in the data model:

| | fields in the model |
|---|---|
| `PlanetConfig` — draws a decorative sphere | **8** (`type`, `seed`, `paletteIdx`, `pixels`, `rotation`, `dither`, `customPalette`, `params`) |
| `ProjectMeta` — everything an agent needs to know about a project | **0** describing how to build, test, run, or navigate it |

`packages/domain/src/types/index.ts:172-195`.

That's not a cheap shot — it's the whole thesis. A project in this app knows its
own *rotation in radians* and does not know its own *test command*.

**Five defects are live right now** (§2 and §12.1). All five share one root cause:

> Agents are configured through **prose** and observed through **scraping**, and
> neither side is validated — so agent-facing breakage produces no error, no
> log, and no UI signal. It looks exactly like "working".

---

## 2. Confirmed defects — live today

> D1-D3 concern what agents are *told*. D4 concerns whether the rules they are
> told to follow actually exist anywhere. All four are invisible in normal use.

### D1 · The only tool every agent is handed does not execute

`packages/domain/src/services/projects/history.ts` → `historyNote()` injects
this into **every** agent's system prompt:

```
sqlite3 "~/.claude/agent-office/db.sqlite" "SELECT role, content FROM messages WHERE …"
```

`~` inside double quotes is never expanded by any shell. Run verbatim:

```
$ sqlite3 "~/.claude/agent-office/db.sqlite" "SELECT role, content FROM messages LIMIT 1"
Error: unable to open database "~/.claude/agent-office/db.sqlite": unable to open database file
exit=1
```

With the path expanded it works fine and there are **642 rows** waiting:

```
$ sqlite3 ~/.claude/agent-office/db.sqlite "SELECT count(*) FROM messages"
642
```

The cause is cosmetic-display code on an executable string:
`DB_PATH.replace(homedir(), "~")`. The codebase already has `expandTilde()` in
`services/infra/paths.ts` — the inverse helper — which tells you this string was
written to be *looked at*, not *run*.

**Severity: high.** It is the single documented mechanism for agent memory
continuity, and it has a 100% failure rate.

### D2 · Every skill reference on this machine resolves to nothing, silently

```
agents declaring skills    : 29
agents with >=1 missing    : 29
distinct skills referenced : 47
distinct actually installed: 0
```

`~/.claude/agents/_skills/` contains four unrelated skills (`claude-api`,
`frontend-design`, `webapp-testing`, `web-artifacts-builder`). None of the 47
referenced names is among them.

`services/skills/skills.ts:798` handles this with:

```ts
const skill = readInstalledSkill(name);
if (!skill?.body) continue;
```

A bare `continue`. And:

```
$ grep -rn "skill_missing|not found" packages/domain/src apps/web/src
(no matches)
```

No log, no warning, no UI badge, no validation on save.

**Why nobody noticed:** a successful skill load emits a
`## Capabilities (from selected skills)` heading into the system prompt. Agent
bodies have been hand-written to include a `## Skills loaded` section that
*looks* the same to a human reading the file. The real one has been absent this
whole time.

**Severity: high.** A declared capability system with a 0% resolution rate.

### D3 · Environment facts the app already owns are hand-typed into prompts, wrongly

`~/.claude/agents/developer.md` contains a 7-line `git apply` ritual and this:

```bash
MAIN=/path/to/agent-office     # literal placeholder, never filled in
```

The real path is `/home/diamond/Documents/Lab/agent-office-main`. The agent is
asked to guess.

Meanwhile the app **already holds every one of those facts**:
`instance.worktree.branch`, `instance.worktree.basePath`, `project.meta.cwd`
(`services/projects/projects.ts:102-106, 390`).

**Severity: medium-high.** Guaranteed to rot; already wrong.

### D4 · The house rules have no home — 7 lint rules cite a document that doesn't exist

`apps/web/eslint.config.mjs` references **CLAUDE.md** seven times as the
authority for this project's conventions, and injects it into agent context as
remediation text:

```
"CSS Grid is forbidden by CLAUDE.md — use Flexbox (flex + flex-wrap + basis-* / w-* / flex-1)."
"CLAUDE.md rule: no `utils`, `helpers`, `common`, `shared` names…"
```

Chasing that citation:

| Claimed source | Reality |
|---|---|
| repo-root `CLAUDE.md` | **MISSING** |
| `~/.claude/CLAUDE.md` | **MISSING** |
| `~/.claude/agents/_global.memory.md` (global memory, injected into **every** prompt) | **MISSING** |
| `apps/web/CLAUDE.md` | exists — **11 bytes**, contents: `@AGENTS.md` |
| `apps/web/AGENTS.md` | 678 bytes — **100% Next.js auto-generated boilerplate**, written by `next dev`. Zero project rules. |

So the chain of authority for this codebase's conventions terminates in a file
a framework generates. **The rules exist only as eslint error strings.**

The real house rules live in exactly two places, neither of which is cited:

- `docs/architecture.md` — rich and accurate prose (layer cake, route anatomy,
  trust boundaries, error-code policy)
- the eslint configs themselves — mechanical and machine-readable

**Severity: medium — but it is the direct blocker for §11.** An agent asked to
"collect this project's house rules" today would follow every citation into a
void. This is the first thing a rule-extraction run must fix.

---

## 3. What the app gets *right* — build on these, don't replace them

Three existing pieces are the correct patterns. Every recommendation in §5 is a
generalisation of one of them.

### 3.1 The skills classifier — this is the map principle, already shipped

`services/skills/skills.ts:774-815`:

```ts
const INLINE_MAX_CHARS = 1500;
…
if (body.length <= INLINE_MAX_CHARS || isSkillCustomized(cfg)) → inline the full text
else → emit a map entry:
  "- **{name}** — {description}\n  Read when the task calls for it: `{path}`"
```

Plus the header: *"Read a skill's file only when the task calls for it — don't
load them pre-emptively."*

That is textbook progressive disclosure: ~120 chars of pointer replacing a 3 KB
body, with the full text one `Read` away. **This is the pattern. It is already
written, already tested, already in production — and applied to exactly one of
the eight things we inject.**

### 3.2 `buildProjectEnvironmentBlock()` — facts injected, not dictated

`services/agents/agents.ts`. Injects live account / GitHub identity / secret
names with usage guidance, e.g.:

> *"Secrets in your environment: X, Y (already set as env vars — use them
> directly, e.g. `$X`; never print their values)"*

Correct in every respect: derived from live state, can't go stale, tells the
agent what it *has* rather than what to *do*. It just stops after three facts.

### 3.3 `background-shell-watcher.ts` — the only place the system talks *to* an agent

When a backgrounded shell dies *after* its owning run ended, the watcher sends a
message into that conversation to make the agent go check it. This is the sole
bidirectional channel in the codebase and it is excellent — it proves the
wake/resume mechanism works and can carry anything.

### 3.4 Other things already right (don't touch)

- `spawn-env.ts` — per-account `CLAUDE_CONFIG_DIR`, `GH_CONFIG_DIR`, and the
  `GIT_CONFIG_*` credential-helper injection. Genuinely careful agent plumbing.
- `run-errors.ts` — stable machine codes, never sentences. Exactly right.
- `summon.ts` — `--append-system-prompt-file` to dodge the 128 KiB
  `MAX_ARG_STRLEN` limit. Correct and well-commented.
- `docs/architecture.md` — the layer-cake rules are clear and mostly obeyed.

---

## 4. Measurements

### 4.1 Agent bodies are manuals, not maps

```
agent                    body chars   words  ~tokens
agent-architect              10,833   1,675    2,708
user-analyst                  8,785   1,413    2,196
orchestrator                  8,770   1,400    2,192
web-qa                        6,423     979    1,606
product-manager               5,656     917    1,414
data-analyst                  5,523     804    1,381
developer                     3,916     593      979
…
TOTAL across 32 agents      116,983           29,246
mean body: 3,655 chars (~913 tokens) resident on EVERY turn
```

### 4.2 `developer.md` broken down by when it actually applies

| section | chars | % | applies when |
|---|---:|---:|---|
| Developer (identity) | 329 | 8% | always |
| Deliver changes / worktree ritual | 1,170 | 30% | only if repo + worktree + files changed |
| Long-running processes | 608 | 16% | only if starting a server |
| Session-end handoff | 1,160 | 30% | only at session end |
| Skills loaded (hand-written) | 637 | 16% | always — **and duplicates the broken D2 system** |

> **75% of the body is conditional procedure carried on every turn.
> 8% is identity.**

This is the 1000-page manual, in miniature, multiplied by 32 agents.

### 4.3 The tiering mechanism exists and is unused

`types/index.ts:591` — `phase: "always" | "first-turn"`.

All **8** segments emitted by `composeAppendedPrompt()` are hardcoded
`phase: "always"` (`agents.ts:311,320,329,342,351,361,370,383`). The
`"first-turn"` value appears only in cost *accounting*
(`context-cost.ts:318`), never as an assembly control.

The data model already knows context should be tiered. The assembler ignores it.

---

## 5. Findings and proposed changes

Every item is numbered `A#` so it can be tracked. **Effort**: S = hours,
M = 1-2 days, L = ~a week, XL = multi-week.

### 5.1 Prompt assembly — the agent's working memory

| # | Change | Why | Effort |
|---|---|---|---|
| **A1** | Fix `historyNote()` tilde quoting (D1) | The one agent tool, 100% broken | **S** |
| **A2** | Make the history pointer a *map entry*, not a raw SQL string — name the table, the useful columns, and one worked example | Agents can write their own queries; they can't guess a schema | S |
| **A3** | Fail loudly on unresolvable skills (D2): warn in `classifySkills`, badge in agents UI, block/flag on save | A 0%-resolution capability system | **S** |
| **A4** | Apply `INLINE_MAX_CHARS` classification to **agent bodies** — short ones inline, long ones become a map entry + `Read` pointer | §4.2: 75% of a body is dead weight on most turns | **M** |
| **A5** | Actually use `phase: "first-turn"` in `composeAppendedPrompt` | The field exists and is ignored (§4.3) | **M** |
| **A6** | Add `phase: "on-demand"` — segments that emit a one-line pointer instead of a body | The missing third tier | M |
| **A7** | Split agent bodies into `identity` (always) and `procedures/*.md` (on demand) | Directly implements map-not-manual for the biggest offender | M |
| **A8** | Deduplicate: when the skills system resolves, suppress hand-written "Skills loaded" prose | Same content twice, one of them stale | S |
| **A9** | Emit the appended prompt verbatim to a debug endpoint / file per run | Today you cannot see what an agent was actually told. This is why D1-D3 survived | **S** |
| **A10** | Token-budget the assembled prompt; warn above a threshold | `context-cost.ts` computes this but nothing enforces it | M |

### 5.2 The project map — the biggest single gap

Today an agent is told: **name, cwd, description.** That's it
(`buildProjectEnvironmentBlock` + the "Active project" segment).

Meanwhile the app *already detects* far more and spends it on buttons:
`detectDevCommands()`, `detectBuildCommand()`, `detectPackageManager()` in
`apps/web/src/lib/server/project-runtime.ts`, plus a per-project **`.ao.json`**
convention supporting `devCommands` and `buildCommand`
(documented in `architecture.md:336`).

> **Architectural trap:** `project-runtime.ts` lives in `apps/web/src/lib/server/`.
> Per the dependency rule in `architecture.md` ("domain **never** imports from
> `@/`"), the prompt assembler in `packages/domain` **cannot reach it**. The
> project map exists on the wrong side of the layer boundary to ever reach an
> agent. This is a real structural cause, not an oversight.

| # | Change | Why | Effort |
|---|---|---|---|
| **A11** | Move command detection from `apps/web/src/lib/server/project-runtime.ts` into `packages/domain/src/services/projects/` | Unblocks everything below; fixes a genuine layering error | **M** |
| **A12** | Promote `.ao.json` to a first-class **project map** file: commands, entry points, conventions, "don't touch" paths, test strategy | One file, human-editable, agent-readable, version-controlled with the repo | **M** |
| **A13** | Inject the project map into the prompt as a map (pointers + commands), not prose | The single highest-value context an agent can have | M |
| **A14** | Add `ProjectMeta` fields for build/test/dev/lint commands (or read them from `.ao.json`) | A project knows its planet's rotation but not its test command | S |
| **A15** | Auto-generate a first-draft project map on bootstrap (detect pm, scripts, framework, monorepo layout) | Zero-config value; user edits after | M |
| **A16** | Inject a **repo tree digest** (top 2 levels + entry points), not a full listing | Orientation without a 10k-token `ls -R` | M |
| **A17** | Surface `git-status.ts` output (branch, dirty files, ahead/behind) into the prompt | Already computed for the UI; agents fly blind | S |

### 5.3 Worktrees — the app creates the problem and delegates it

`services/projects/worktrees.ts` is solid code. But the app creates a worktree,
puts the agent in it, and then **tells the agent in prose to get its own work
out** via a 7-line `git diff | git apply` ritual with a placeholder path (D3).

| # | Change | Why | Effort |
|---|---|---|---|
| **A18** | `POST /api/projects/:id/roster/:instanceId/deliver` — the app owns worktree→main delivery | Removes the single most error-prone thing agents do | **M** |
| **A19** | Inject worktree facts (branch, base path, main checkout path, delivery mechanism) into the env block | Replaces hand-typed, currently-wrong prose with live data | **S** |
| **A20** | Delete the ritual from every agent body once A18/A19 land | -1,170 chars/turn on `developer` alone | S |
| **A21** | Surface delivery state in the UI (delivered / pending / conflicted) | Users currently discover "I see no changes" by surprise | M |
| **A22** | Detect path overlap between worktree and main before delivery, report as a conflict | The prose says "eyeball `git status`" — make it mechanical | M |

### 5.4 Observation and the return channel

`subagent-parse.ts` detects sub-agent spawns by **regexing Bash command
strings**, with the fallback heuristic *"the last quoted string is usually the
prompt"* (`parseClaudeBashSpawn`, `extractBashPrompt`).

| # | Change | Why | Effort |
|---|---|---|---|
| **A23** | Give agents a real dispatch tool so spawns are *declared*, not inferred | Removes a whole class of silent mis-parse | **L** |
| **A24** | Keep the regex path as a fallback for hand-rolled `claude -p` | Back-compat | S |
| **A25** | `office_ask_user` — let a run ask a question and suspend instead of guessing | `stdio: ["ignore", "pipe", "pipe"]` at `runs.ts:97` means **stdin is closed**; an agent literally cannot ask. §3.3 proves the wake path works | **L** |
| **A26** | Structured step handoff in pipelines | `pipeline.ts:260,307` does `promptTemplate.replace(/\{\{output\}\}/g, previousOutput)` — the previous agent's **entire stdout** as a blob | **L** |
| **A27** | Let a step declare what it needs from the previous step | Fan-in currently `join("\n\n---\n\n")` of every parallel output | M |
| **A28** | Add a per-run idle timeout | `lastActivityAt` is tracked (`runs.ts:126,380`) and **never read**; only pipelines have timeouts | S |

### 5.5 Memory and continuity

| # | Change | Why | Effort |
|---|---|---|---|
| **A29** | Let agents **write** their own memory (tool or endpoint) | `writeAgentMemory()` exists; only the human UI calls it. Agents can read memory, never update it | **M** |
| **A30** | Make `NEXT_SESSION.md` a real feature, not a prompt instruction | It's 30% of `developer.md`'s body and re-implemented per agent. The app has runs, messages, conversations — it should generate the handoff | **M** |
| **A31** | Give agents a map of *what memory exists* rather than pasting all of it | Global + project + agent memory are all inlined `phase:"always"` | M |
| **A32** | Expose docs to agents — `docs/_index.json` already is a map, rendered only to a React tab UI | 11 docs about the app; no agent can discover them | S |
| **A33** | Wire up `/api/docs/export` — machine-readable API+schema+events, currently **zero consumers** | Built for a reader that was never connected | S |

### 5.6 Agent definition storage

`~/.claude/agents/` is one flat directory multiplexing five naming
conventions: `<id>.md`, `<id>.memory.md`, `<id>.identity.md`,
`<id>.body.<timestamp>.md`, `_`-prefixed specials. `listAgents()` filters with a
growing blacklist (`agents.ts` — 6 clauses and counting). This install has 6
stale `developer.body.*.md` files sitting next to live definitions.

| # | Change | Why | Effort |
|---|---|---|---|
| **A34** | Move to `agents/<id>/{agent.md,identity.md,memory.md,procedures/,history/}` | Every new concept currently costs a blacklist clause | **M** |
| **A35** | Validate frontmatter on save (skills exist, model/effort valid, tools known) | D2 is the symptom of having no validation at all | S |
| **A36** | Prune `.body.*` history on a retention policy | Unbounded growth in the same namespace as live agents | S |

### 5.7 Feedback loop — why all of this rotted

There is **no test, no check, and no view** that exercises the agent-facing
surface. D1 survived because the string was only ever read, never run. D2
survived because a `continue` is invisible. D3 survived because nothing compares
prompt text to live state. D4 survived because nothing resolves a citation.

All four are mechanically detectable — which is the entire argument for §11.

| # | Change | Why | Effort |
|---|---|---|---|
| **A37** | Snapshot-test `composeAppendedPrompt()` for a fixture agent | Would have caught D1 and D2 immediately | **S** |
| **A38** | Lint agent-facing strings: any shell command emitted into a prompt must run in a smoke test | Would have caught D1 | **S** |
| **A39** | "Preview prompt" view — show the exact assembled prompt for an agent+project | The missing mirror. Pairs with A9 | **M** |
| **A40** | Startup health check: unresolvable skills, missing worktrees, stale paths → surface in UI | Turns silent rot into a visible list | M |
| **A41** | Track and display assembled-prompt token cost per agent over time | `context-cost.ts` computes it; nothing trends it | M |

---

## 6. What to stop doing

Not "delete the office" — the isometric view is the app's personality and the
user likes it. But these specific habits are what caused the drift:

1. **Stop writing procedures into agent bodies.** If it's conditional, it's a
   procedure file behind a pointer (A7). If it's environmental, the app injects
   it from live state (A19).
2. **Stop shipping prose the app could compute.** Every hand-typed path,
   command, or branch name is a future D3.
3. **Stop adding cosmetic fields to core models before functional ones.**
   `PlanetConfig` has 8 fields; `ProjectMeta` has no test command.
4. **Stop inferring what agents could declare.** Regex-scraping stdout is a
   fallback, not an architecture (A23).
5. **Stop treating "no error" as "working."** D1-D4 all present as
   silence. Silence needs to become a signal (A37-A40, and §11).

---

## 7. Suggested sequencing

**Phase 0 — stop the bleeding (S, ~1 day).** A1, A3, A9, A37, A38.
Fix the two live defects and build the mirror that makes future breakage
visible. Everything after this is much safer to attempt.

**Phase 1 — the map (M, ~1 week).** A11, A12, A13, A15, A16, A17, A19, A18.
Move command detection into domain, promote `.ao.json` to the project map, inject
it, and make worktree delivery an API. **This phase is where agents' lives
actually get better.**

**Phase 2 — tiering (M, ~1 week).** A4, A5, A6, A7, A8, A20, A31.
Implement the three phases and move every conditional procedure behind a
pointer. Measurable success: mean resident body drops from ~913 tokens toward
a few hundred.

**Phase 3 — the tool surface (L/XL).** A23, A25, A26, A29, A33.
An agent-facing MCP server. Note that `summon.ts` **already builds
`--mcp-config` / `--strict-mcp-config`** (to strip Playwright) — the mechanism
for granting agents tools is shipping today and is used only to *remove* a
server. Flipping it to *add* one is far less work than it sounds.

**Phase 4 — housekeeping.** A34, A35, A36, A21, A22, A40, A41.

---

## 8. Open questions for the user

1. **`.ao.json` vs `AGENTS.md`.** The project map could be JSON (structured,
   app-editable) or Markdown (agent-native, human-friendly, matches the
   ecosystem convention). *Recommendation: `AGENTS.md` for prose + `.ao.json`
   for commands the app must execute.* They serve different readers.
2. **How aggressive should body-trimming be?** A4 could break agents whose
   behaviour depends on always-resident procedure. *Recommendation: opt-in per
   agent, measure, then flip the default.*
3. **MCP server vs HTTP + injected map.** MCP is the better long-term surface;
   an injected map of `curl` one-liners is a fraction of the work.
   *Recommendation: map first (Phase 1), MCP once we know which tools agents
   actually reach for.*
4. **Does the office view need agent-facing equivalents at all?** My read: no.
   Keep it as the human layer. The fix is not "make the office agent-readable,"
   it's "stop letting the office absorb the effort budget."

---

# 9. External validation — OpenAI's "Harness Engineering" (Nov 2025)

Source: <https://openai.com/index/harness-engineering/> — *"Harness engineering:
leveraging Codex in an agent-first world."* Three→seven engineers, one greenfield
repo, ~1M LOC, ~1,500 PRs, **0 lines of manually-written code**.

Read after §1-8 were written. It independently reaches most of the same
conclusions, which raises confidence — but it also describes a **different
problem shape**, and a few of its conclusions would be actively harmful here.
Both are recorded below.

## 9.1 The two-level distinction (read this before anything else)

OpenAI built a **harness inside one repository**: ad-hoc scaffolding that makes
*their* codebase legible to Codex.

Agent Office is trying to be a **reusable harness** — the thing that runs agents
across *many* repositories.

So every capability they hand-rolled is, for us, a **product feature**:

| They built it once, by hand, for their repo | For Agent Office this is… |
|---|---|
| App bootable per git worktree | a feature (we already create the worktrees) |
| Observability stack per worktree, queryable by the agent | a feature (we already read `/proc`, `ss`, shell logs) |
| `AGENTS.md` as a ~100-line map + `docs/` as system of record | a feature (generate + maintain it per project) |
| Custom linters whose error text is agent remediation | a feature (we already do this for taste rules) |
| Doc-gardening agent on a cadence | a feature (**`scheduler.ts` already exists**) |
| Plans as first-class versioned artifacts | a feature (we have workflows/pipelines — in the wrong place, see A46) |

**That is the product thesis.** Their post is, accidentally, a spec for what
Agent Office should be.

## 9.2 What it confirms

Their four documented failure modes of the "one big `AGENTS.md`" approach map
1:1 onto findings reached independently in §2-§5:

| Their failure mode | Our evidence |
|---|---|
| "Context is a scarce resource" | §4.1 — ~29k tokens of bodies; mean 913 resident per turn |
| "Too much guidance becomes *non-guidance*" | §4.2 — `developer.md` is 75% conditional procedure, 8% identity |
| "It rots instantly… a graveyard of stale rules" | **D3** — `MAIN=/path/to/agent-office`, a placeholder never filled in |
| "It's hard to verify… drift is inevitable" | §5.7 — zero tests/checks/views exercise the agent-facing surface; **D1 and D2 are the result** |

Also confirmed:
- *"Give Codex a map, not a 1,000-page instruction manual"* — §0, verbatim.
- *"Progressive disclosure: agents start with a small, stable entry point and are
  taught where to look next"* — exactly what `skills.ts:774-815` already does (§3.1).
- *"Enforce invariants, not micromanage implementations"* — §6.1.
- *"When the agent struggles… identify what is missing — tools, guardrails,
  documentation — and feed it back"* — the framing this whole audit adopts.

**The single most useful sentence in the post:**

> *"From the agent's point of view, anything it can't access in-context while
> running effectively doesn't exist."*

Applied to us: the SQLite DB (642 messages, every run, every transcript,
analytics, workflows), the office layout, the roster, the docs tabs —
**from an agent's point of view none of it exists.** That is the strongest
possible argument for §5.4/§5.5 and it reframes A33 from "nice to have" to
"the DB is currently write-only from the agent's side."

## 9.3 New changes this suggests (A42-A50)

| # | Change | Why | Effort |
|---|---|---|---|
| **A42** | Per-project `AGENTS.md` (~100 lines) as **table of contents**, with `docs/` as system of record and `.ao.json` for machine-executable commands. App generates a first draft and keeps it fresh | **This resolves §8 Q1.** Not "both for different readers" — three tiers: map / territory / executable | **M** |
| **A43** | Give every `RunErrorCode` an agent-facing **remediation** string, not just a human UI label | Their insight: *"because the lints are custom, we write the error messages to inject remediation instructions into agent context."* We already do this for the CSS-grid lint; `run-errors.ts` should do it too | **S** |
| **A44** | **Doc-gardening scheduled agent** — recurring job that scans for stale docs, dead paths, unresolvable skill refs, and opens fixes | `scheduler.ts` already exists. This is ~80% built and it would have caught **D1, D2 and D3** | **M** |
| **A45** | Quality grades per domain/layer, tracked over time | They grade each domain and track gaps. We have analytics infra for *cost*; none for *health* | L |
| **A46** | Plans as **repo-local versioned artifacts**, not SQLite rows | Workflows/pipelines live in the DB → invisible to the agent (§9.2). Theirs are checked into the repo with progress + decision logs. Upgrades **A30** | **M** |
| **A47** | **App bootable per worktree**, with logs/metrics for that instance exposed to the agent | Their highest-leverage single move. We already have worktrees, `processes.ts`, background shells, port allocation — the pieces are here | **L** |
| **A48** | Enforce the layering invariant mechanically (`domain` must not import `@/`) | Confirmed today: `packages/domain/eslint.config.mjs` has **no such rule**. The invariant is prose in `architecture.md` only — and §5.2's stranded `project-runtime.ts` is the direct consequence | **S** |
| **A49** | **Budget-governed autonomy** — autonomy loops bounded by the existing `maxBudgetUsd` / spend tracking | Their post never mentions cost; a personal Max-plan user cannot ignore it. See §9.4 | M |
| **A50** | Explicit policy: knowledge an agent needs is **repo-local and versioned**; the DB is for app state only | Prevents re-committing the mistake that made the DB write-only from the agent side | S |

## 9.4 What NOT to copy

Their constraints are extreme and context-specific. They say so themselves:

> *"This behavior depends heavily on the specific structure and tooling of this
> repository and should not be assumed to generalize without similar investment."*

| Their practice | Why it does **not** transfer here |
|---|---|
| **"Minimal blocking merge gates; test flakes addressed with follow-up runs rather than blocking."** | They justify this purely by throughput — *"in a system where agent throughput far exceeds human attention, corrections are cheap"* — and explicitly add *"this would be irresponsible in a low-throughput environment."* A solo dev running 3-5 agents is a low-throughput environment. **Copying this is the single most dangerous idea in the post for us.** |
| **Reimplementing dependencies** (their `p-limit` example) | Justified by whole-tree agent legibility at 1M LOC with 7 full-time engineers. For a personal tool it is a pure maintenance tax, and it contradicts the ponytail principle (reach for stdlib/existing deps first). |
| **"0 lines of manually-written code"** | An experimental constraint deliberately chosen *to force harness investment* — not a best practice. Useful as a forcing function, harmful as dogma. |
| **Unbounded autonomy** (6-hour runs, background cleanup fleets, automerge) | No cost ceiling in their setting. Here, runs hit rate limits and cost real money — which is exactly why `maxBudgetUsd`, `reset-time.ts` and spend analytics exist. **Autonomy must be budget-governed (A49).** This is a place Agent Office can be *better* than their harness, not just catch up. |
| **Their rigid 6-layer architecture** (Types→Config→Repo→Service→Runtime→UI) | We already have a simpler layer cake that fits. Adopt the *mechanical enforcement* (A48), not their specific layering. |

## 9.5 Net effect on this audit

Nothing in §1-§8 is invalidated. Priorities shift as follows:

1. **A44 (doc-gardening agent) jumps up.** It is the cheapest thing that
   *automatically* prevents D1/D2/D3-class rot, and the scheduler already exists.
2. **A48 (enforce layering) jumps into Phase 0.** It is a few lines of eslint
   config, and §5.2's stranded project map is proof the unenforced rule already
   cost us.
3. **A43 (remediation in error codes) joins Phase 0.** Small, and it turns every
   failure into a self-service fix.
4. **§8 Q1 is answered** — see A42. That was the blocker on starting Phase 1.
5. **A47 (bootable per worktree)** becomes the flagship Phase 3 item, ahead of a
   general MCP server: it is more concrete, we own more of the pieces, and it
   targets the same "make the app legible to the agent" goal.

---

# 10. Design: the Loop (agent-to-agent review)

> **Status:** design, not implemented. Decisions marked **[?]** need the user.
> **Goal (user's words):** *"with a single switch like playwright on/off I should
> be able to turn on agent loops where they would either collab locally or even
> use github / github comments to review each others work / logic gaps."*
> **Scope:** features and big tasks. Explicitly **not** tiny tasks.

This is the productised form of the "Ralph Wiggum loop" described in §9 —
*"review its own changes locally, request additional specific agent reviews,
respond to feedback, and iterate until all agent reviewers are satisfied."*

## 10.1 The central design decision

**The Loop is an extension of `conversation-machine.ts`, not a new subsystem.**

That machine is already pure, unit-tested, and solves the exact reliability
problems a loop would otherwise re-introduce:

- a failed turn **never** auto-advances and never silently resumes
- the queue has **exactly one** drainer (no double-drain race)
- a `runFinished` for a superseded run is **ignored** (no late-finish clobber)
- `needs_attention` already exists as the human-escalation state, with UI

A parallel `loop.ts` orchestrator (the obvious move, mirroring `pipeline.ts`)
would duplicate all of it and get the races wrong. `pipeline.ts` is *already*
a second, weaker execution path — do not add a third.

Concretely: `ConversationState` gains a `loop` field; `reduce()` gains loop
transitions; `runFinished { ok: true }` consults the loop before calling
`advance()`.

## 10.2 What already exists (this is why it's tractable)

| Piece the Loop needs | Already in the repo |
|---|---|
| Isolated workspace per agent | `worktrees.ts` — **the worktree branch is the natural unit of review** |
| Adversarial reviewer agent | `qa-code-review` — *"reads a diff, returns MUST-FIX / SHOULD-FIX / NIT… grounds every finding in a specific line + rule"* |
| More reviewers | `qa-codebase`, `qa-pen-testing`, `qa-visual`, `web-qa` |
| Reviewer can't sabotage the diff | `qa-code-review` tools are `[Read, Bash, Grep, Glob, Task]` — **no Write/Edit** |
| Round-by-round visualisation | `parentRunId` + `buildRunTree()` + `/api/runs/:id/tree` — **the loop renders for free** |
| Per-run cost | `run.cost`, `total_cost_usd` from the CLI result line |
| Per-run budget ceiling | `maxBudgetUsd` → `--max-budget-usd` (plumbed, no UI yet) |
| Human escalation state + UI | `needs_attention` |
| Severity taxonomy | MUST-FIX / SHOULD-FIX / NIT, already the reviewer's contract |

**The convergence signal already exists.** We do not need to invent one.

## 10.3 The five ways this fails, and the mitigation for each

A loop is easy to build and easy to build *badly*. These are the failure modes,
with the mitigation baked into the design rather than bolted on.

| # | Failure mode | Mitigation |
|---|---|---|
| **F1** | **Runaway cost / time.** Loop never terminates; money burns overnight. | Three independent ceilings: `maxRounds` (default 3), cumulative `budgetUsd`, wall-clock cap. Any breach → `needs_attention`, never silent continuation. Ties to **A49**. |
| **F2** | **Sycophancy.** Reviewer rubber-stamps; loop converges in one round and adds nothing. | Reviewer **must be a different agent** than the author (enforced, not advised). Reviewer is read-only. Reviewer receives the **original task + the diff — not the author's transcript or reasoning**, so it cannot anchor on the author's justification. |
| **F3** | **Thrash / non-convergence.** Reviewer keeps finding nits; author keeps churning. | **Only MUST-FIX blocks.** SHOULD-FIX and NIT are recorded and surfaced to the human, never re-dispatched. Severity taxonomy already exists. |
| **F4** | **Context explosion.** Each round appends the previous transcript; round 3 is mostly noise. | The fix run receives **the findings list + the diff**, not the prior transcript. This is the §5.4/A26 `{{output}}`-blob problem — do not repeat it inside the Loop. |
| **F5** | **Verdict parsing by regex.** App greps the reviewer's prose for "MUST-FIX". | **Structured verdict file** (§10.4). Regex-scraping agent prose is the mistake `subagent-parse.ts` already embodies (A23) — do not repeat it. |

## 10.4 The verdict protocol

The reviewer writes a file into the worktree; the app reads and validates it.

```
<worktree>/.ao/reviews/<runId>.json
```

```jsonc
{
  "verdict": "pass" | "block",
  "summary": "one line",
  "findings": [
    { "severity": "must-fix" | "should-fix" | "nit",
      "file": "src/foo.ts", "line": 42,
      "rule": "architecture.md: domain must not import @/",
      "why": "…", "fix": "…" }
  ]
}
```

Why a file rather than a tool call or prose parsing:

- **No new infrastructure.** The agent already has `Write`; the app already
  reads files. Works today, with zero MCP work (Phase 3 can upgrade it to
  `office_submit_review` later without changing the state machine).
- **Repo-local and versioned** — satisfies the **A50** policy. The review is
  visible to the next agent, and to a human, and to git.
- **Validated at the boundary** with Zod per `architecture.md`'s trust-boundary
  rule. A malformed verdict is a *loop error*, not a silent pass.

**Fail-closed:** missing or unparseable verdict ⇒ treated as `block` with reason
`verdict_missing`, escalate to the human. Never treat absence as approval — that
is the D1/D2 silent-failure pattern in a new costume.

## 10.5 State machine sketch

```
          ┌──────── user sends a task (loop: on) ────────┐
          v                                              │
   [author run] ──ok──> [review run(s)] ──pass──> done ──┘
          │                    │
        fail                  block
          │                    │
          v          round < max ─┴─ round == max
   needs_attention        │              │
                          v              v
                   [fix run] ──> …   needs_attention
                                      (findings shown)
```

- Parallel reviewers (`qa-code-review` + `qa-pen-testing`) fan out; verdict is
  the **union** of findings, `block` if any reviewer blocks.
- Every run in the loop carries `parentRunId` → the existing run-tree UI
  renders the whole loop with **no new visualisation work**.

## 10.6 The toggle — one nuance worth getting right **[?]**

The user asked for "a single switch like playwright on/off". `playwrightEnabled`
lives on `AgentInstance` (per-instance, persistent).

But the user also said this **should not apply to tiny tasks** — and a
per-instance flag would loop *every* message sent to that agent, including
"fix this typo".

**Recommendation:** two-level, mirroring how model/effort already work:

- `AgentInstance.loop?: LoopConfig` — the **default** for this instance.
- A per-send override in the composer (a toggle next to send, like a send-mode).

This matches the existing `request.model ?? instance?.model ?? agent.defaultModel`
resolution chain in `summon.ts` — a pattern already in the codebase.

## 10.7 Local vs GitHub **[?]**

**Finding: the app has no PR concept whatsoever.** Verified —
`grep -rn "pull request|gh pr|createPR"` across `packages/domain/src` and
`apps/web/src` returns **nothing**. GitHub integration today is purely identity
(`GH_CONFIG_DIR` + `GIT_CONFIG_*` credential helper so `gh` works inside a run).

| | Local loop | GitHub loop |
|---|---|---|
| New concepts needed | verdict file, loop state | PR tracking, comment threading, polling/webhooks, comment→agent mapping, review-state reconciliation |
| Reuses | worktree, run tree, conversation machine, `needs_attention` | little of the above |
| Effort | **days** | **weeks** |
| Catches bad code before the user sees it | yes | yes |
| Durable audit trail / human collaboration | partial | yes |
| Works offline / private repos / no remote | yes | no |

**Recommendation: local first, GitHub as a later publish step.** The 90% of the
value the user described — *"I have to check if agent didn't do some shit code,
half-assed code, rule violations"* — is delivered entirely by the local loop.
GitHub's marginal value is human collaboration and audit, which matters later.

When GitHub does land, the right shape is: the local loop converges, **then**
the app opens the PR with the review history attached as the PR body. That way
GitHub receives a *result*, not a conversation — far less machinery.

## 10.8 What makes this better than "prompt the agent to self-review"

Worth stating plainly, because the cheap version is tempting:

1. **A different agent** with a different system prompt catches what the author
   is blind to. Self-review anchors on the author's own reasoning (**F2**).
2. **Read-only reviewer** cannot "fix" its way out of a finding.
3. **Machine-checked convergence** — the app knows the state, so it can enforce
   budgets, escalate, and show progress. A self-review prompt gives the app
   nothing to reason about.
4. **Rules are injected as reviewable invariants.** Once **A48** lands, the
   reviewer can be handed the actual lint/architecture rules and cite them by
   name (`rule` field), instead of inventing standards each run.

## 10.9 Sequencing

**Loop v0 (days)** — one reviewer, local, no fan-out.
`LoopConfig` + verdict file + Zod schema + machine transitions + the three
ceilings + per-send toggle. Reuses run tree for display.

**Loop v1** — parallel reviewers, per-project reviewer defaults, findings
surfaced in the chat UI, SHOULD-FIX/NIT digest.

**Loop v2** — GitHub publish step (§10.7), review history in the PR body.

**Dependencies worth noting:** the Loop is *much* stronger after **A48**
(enforceable rules to cite), **A12/A42** (project map, so reviewers know the
conventions), and **A43** (remediation text). It does not *require* them.

---

# 11. Design: Codebase Custodian — one-click rule extraction & debt scan

> **Status:** design, not implemented.
> **Goal (user's words):** *"By 1 click of a button agent would collect all the
> data about the project house rules, how they write code etc and then depending
> on those rules agent would make a run and put everything into tech debt"* —
> Local button first, **nightly** later.
> **Scope (critical):** this is **not** for the Agent Office repo. It is a
> product feature for **every project run through Agent Office.**
>
> **DECIDED — auto-fixing is OUT of harness scope.** The Custodian is
> **read-only**: it detects, classifies and records. Fixing is deferred to the
> very end and implemented **per project**, not in this harness. See §11.6.

## 11.0 The operating reality this must serve

The team builds **a lot of software across many varied projects** — constant
research, building, experimenting. Agent Office exists to make that organized
and leveraged. Three consequences dominate every design decision below:

1. **Per-project setup cost must be ≈ zero.** With high project churn, anything
   that requires hand-writing rules or config per project **will not happen**.
   Auto-bootstrap is the default path, not the fallback.
2. **Projects are heterogeneous.** Next.js, Flutter (already supported), Python,
   whatever comes next. A JS-only design is useless here.
3. **Most projects are pre-existing repos**, not scaffolded from templates. The
   feature must onboard a repo it has never seen.

This is also the **§9.1 product thesis made concrete**: OpenAI hand-built a
harness inside one repo. This feature *is* the reusable version — the single
clearest reason Agent Office should exist rather than running `claude` directly.

## 11.1 The map generator already exists — wired to the wrong trigger

`project-bootstrap.ts → writeRootClaude()` already generates, for a new project:

```markdown
# <name>
<description>
## Layout          | Directory | Stack | Read |
## How to work in this repo
## Run             ```bash … ```
## Out of scope
```

**That is the AGENTS.md-as-table-of-contents pattern from §9, already
implemented** — a ~40-line map, not a manual. It is genuinely good.

Its problem is the trigger, not the content:

| Limitation | Consequence |
|---|---|
| Runs only in `bootstrapProject()` | **Only greenfield projects scaffolded from Agent Office templates get a map.** Every imported/existing repo gets nothing — which is most of them |
| One-shot write at creation | Never refreshed; the `_add what this project does NOT do_` placeholder sits there forever |
| Node/Python-specific `## Run` section | Doesn't generalize to Flutter/Rust/Go |
| Agent Office itself was never bootstrapped this way | **This is D4.** The app writes house-rules files for other projects and has none of its own |

**Change: promote `writeRootClaude` from a bootstrap step to a first-class,
stack-aware, re-runnable "generate/refresh project map" service.** That single
move gives every project a map on onboarding, which is the precondition for
everything else in this section.

## 11.2 One button, staged internally

One click. The staging below is internal architecture, not steps the user
babysits.

```
[ Run Custodian ]
   │
   1. MAP      refresh project map + detect stack            (fast, cached)
   2. RULES    resolve rule profile (house → stack → project)
   3. SCAN     read-only: findings -> .ao/debt.json          (incremental)
   4. CLASSIFY tag each finding with a fixClass              (§11.6)
   5. REPORT   render in-app; commit the artifact to the repo
```

**The whole pipeline is read-only with respect to project code.** The only
thing it writes is `.ao/debt.json` (and a refreshed `CLAUDE.md` map, on
request). That is a deliberate and load-bearing property:

- it can be run against **any** project, including ones nobody trusts yet;
- it can run **nightly across the whole portfolio** without a review burden;
- a bad rule produces a wrong *report*, never a wrong *commit*;
- no per-stack verification machinery is needed in the harness (see §11.6).

## 11.3 Rules: three layers, inherited

At this scale, per-project rules alone are the wrong model — you'd rewrite the
same conventions 30 times. Rules **layer**, resolving exactly like the existing
`request.model ?? instance?.model ?? agent.defaultModel` chain in `summon.ts`:

| Layer | Home | Applies to | Example |
|---|---|---|---|
| **House** | `~/.claude/agents/_global.memory.md` (the existing global-memory slot — **currently MISSING, see D4**) | every project | "errors are machine codes, never sentences" |
| **Stack** | app-managed, per detected stack | every project on that stack | Next.js: "validate request bodies at the boundary"; Flutter: "no `setState` in build" |
| **Project** | `.ao/rules.json` + repo `CLAUDE.md` | one project | "domain never imports from `@/`" |

**The stack layer is the leverage.** Fix a Flutter rule once and every Flutter
project inherits it. That is a capability no per-repo harness can have, and it
only becomes more valuable as project count grows.

Project rules may **override or disable** an inherited rule — recorded with a
reason, so the override is visible rather than silent drift.

## 11.4 Rule extraction, stack-agnostic

Rules are **discovered and cited**, never invented. Tiers by trust:

| Tier | Source | Trust |
|---|---|---|
| **1 — Mechanical** | whatever the project actually has: `eslint`, `ruff`, `clippy`, `golangci-lint`, `dart analyze`, `rubocop`, `tsconfig` strictness, CI workflows | **authoritative** — machine-readable, zero inference |
| **2 — Written** | `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `docs/`, ADRs | **authoritative** — needs extraction into discrete rules |
| **3 — Inferred** | patterns sampled from the code | **proposal only** — `inferred: true`, requires promotion |

Tier 1 detection reuses the existing shape of `detectPackageManager` /
`detectDevCommands` — config-file presence, already proven across Node, Python
and Flutter in `project-runtime.ts`.

> **Tier 3 is the trap.** *"We always do X"* may be a bug repeated five times.
> An agent that treats observed patterns as rules enforces accidents and
> calcifies them. Inferred rules are proposals until a human promotes them.

### Projects with no rules at all

Common, and the interesting case. The Custodian proposes a starter profile from
**house + stack + observed patterns**, and asks once. For a team spinning up
experiments constantly, *"Agent Office set up sane house rules for my new repo
in 30 seconds"* is a feature in its own right.

### Rule shape

```jsonc
{
  "id": "arch.domain-no-app-imports",
  "statement": "packages/domain must never import from @/ (app code).",
  "layer": "project",              // house | stack | project
  "tier": "written",               // mechanical | written | inferred
  "source": "docs/architecture.md:52",
  "enforcement": "none",           // lint | test | none
  "severity": "must-fix",
  "fixClass": "C"
}
```

`enforcement: "none"` is itself a finding — a stated rule with no mechanical
check *will* be violated. The Custodian emits **"promote to lint"** candidates,
which is exactly **A48**.

## 11.5 Findings

```jsonc
{
  "id": "debt-0142",
  "ruleId": "arch.domain-no-app-imports",  // REQUIRED — no finding without a rule
  "file": "packages/domain/src/services/x.ts",
  "line": 12,
  "severity": "must-fix",
  "fixClass": "A",
  "why": "…", "suggestedFix": "…",
  "firstSeen": 1759104000000,
  "status": "open"                 // open | accepted | wontfix | fixed
}
```

**Every finding cites a rule; every rule cites a source.** This one constraint
kills "agent invents standards" and makes a finding reviewable in seconds — you
read the citation, not the argument.

**`accepted` / `wontfix` must persist across scans**, or the nightly re-reports
the same items forever, you learn to ignore it, and the feature dies.

## 11.6 Fix classes — classification only (the harness never fixes)

**Decision: the Custodian classifies but does not fix.** Auto-fixing is deferred
to the very end and belongs **per project**, not in this harness.

### Why this is the right split

1. **Verification is inherently project-specific.** A safe auto-fix requires
   *that project's* typecheck, lint and test suite to pass. Building a generic
   fixer into the harness means teaching the harness to verify every stack it
   will ever meet — Next.js, Flutter, Python, whatever is next. Each project
   already knows how to verify itself.
2. **Read-only is a safety property worth keeping.** A harness that never writes
   project code can be pointed at anything, including a repo onboarded five
   minutes ago, and run unattended across the portfolio.
3. **Review burden was the real risk** (below). Deferring the fix removes it
   entirely rather than managing it.

### Classification still matters

The `fixClass` tag is valuable **even though the harness never acts on it** —
it is what tells a human, or a per-project script, what is safe to automate:

| Class | Examples | Verifiable by | Who acts |
|---|---|---|---|
| **A — mechanically verifiable** | lint autofix, unused imports, dead exports with zero refs, missing return types, import ordering | typecheck + lint + tests | **per-project tooling** (later) |
| **B — locally reviewable** | extract a duplicated helper, split a 400-line file, rename for convention | tests + human glance | human, or an explicit agent task |
| **C — needs judgment** | "this abstraction is wrong", "this boundary leaks" | nothing | human decision |

### The handoff: the harness writes the work order, the project executes it

This split works cleanly **because the debt register is already a repo-local
artifact** (§11.10, policy A50). The Custodian commits `.ao/debt.json` into the
project; anything in that project can then consume it:

```
Agent Office  ──writes──>  <project>/.ao/debt.json  ──read by──>  per-project
(detect, classify,          (rules, findings,                      fix script /
 portfolio trends)           fixClass, status)                     CI job / agent task
```

The harness never needs to know how a given project fixes things — only how to
describe what is wrong, and in what terms. That is a much smaller and much more
durable contract.

### If and when fixing is built (per project, later)

The constraints that made it survivable, recorded here so they aren't
re-derived:

1. **One rule per PR** — all import ordering, *or* all dead code. Never mixed.
   This is the constraint that makes a PR reviewable in under a minute; the
   automation is the easy part.
2. **Green before open** — typecheck, lint and tests pass, or no PR.
3. **Class A only** by default.
4. **Never detect and fix in the same run**, and not with the same agent — or
   the fixer grades its own homework.
5. A 200-change "fix all debt" PR recreates the exact problem this is meant to
   solve. An unreviewable PR is **worse** than no PR: it launders slop through a
   process that looks like diligence.

### What catches bad code in the meantime

With fixing out of scope, **the Loop (§10) becomes the primary defence** against
half-finished work — it reviews changes as they are authored, which is earlier
and cheaper than catching them in a nightly sweep. The Custodian's job is the
slower one: finding rot that accumulated *before* anyone was watching.

## 11.7 Delivery — nothing to deliver

With fixing out of scope the Custodian produces **no code changes**, so the
PR / branch / patch matrix that an auto-fixing version would have needed does
not apply. It writes two artifacts into the project repo and stops:

| Artifact | Purpose |
|---|---|
| `.ao/debt.json` | the findings + rules + classifications |
| `CLAUDE.md` | the refreshed project map (§11.1), on request |

Committing those is an ordinary change the user reviews like any other — or the
app can leave them uncommitted and show the diff.

> The delivery matrix still matters for **A18** (worktree → main checkout), which
> is a separate concern: getting *agent authored work* out of a worktree. That is
> unaffected by this decision.

## 11.8 Project lifecycle tier

*"We constantly research, build, experiment"* — a spike must not get
production-grade enforcement. `ProjectMeta.shelved` already hints at lifecycle;
make it explicit:

| Tier | Rules | Nightly | Reporting |
|---|---|---|---|
| **experiment** | house only | off | scan on demand |
| **active** | house + stack + project | weekly | findings + grade |
| **production** | all, strict | nightly | findings + grade + trend, must-fix surfaced |

Default **experiment**, so a new repo costs nothing and never nags.

## 11.9 Cross-project learning — the part only Agent Office can do

With N projects in one harness, the Custodian sees what no single-repo harness
can:

- A pattern appearing independently in 8 projects → **propose it as a house rule.**
- A house rule violated in *every* project → **it's a bad rule; propose demotion.**
- A stack rule that keeps producing accepted findings → **promote to lint (A48).**
- Debt grades trending per stack → *"our Flutter projects are drifting."*

This compounds with project count, and it is the strongest strategic argument
for the app existing at all.

## 11.10 Where it lives

Per **A50** — agent-needed knowledge is repo-local and versioned; the DB is app
state only:

- **Source of truth (in each project repo):** `CLAUDE.md` (the map),
  `.ao/rules.json`, `.ao/debt.json` — committed, diffable, visible to every
  agent, travels with the repo even outside Agent Office.
- **App DB:** index for cross-project queries, grades and trends. Rebuildable.
  Never authoritative.
- **House + stack layers:** app-managed, injected at resolve time.

Same shape as the Loop's verdict file (§10.4), deliberately: **agents write
structured artifacts into the repo; the app reads, Zod-validates, renders.**
No new protocol, no MCP dependency, works today.

## 11.11 Sequencing

**v0 — the button, read-only.** Map refresh + rule resolution + scan +
classification + debt register + in-app view, across the project list.

**v1 — nightly.** Onto `scheduler.ts` (already per-project via
`summonRequest.projectId`). Incremental scanning, dismissal persistence,
per-project budget ceiling (**A49**).

**v2 — grades, trends, cross-project learning** (§11.9, A45). This is where the
portfolio view starts paying for itself.

**Later, per project, out of harness scope — fixing.** See §11.6.

> Because the harness never writes project code, there is no "earn trust before
> it can act" gate any more. A new repo can be scanned on day one; the only
> cost of a wrong rule is a wrong line in a report.

## 11.12 What this costs if we skip it

D1, D2, D3 and D4 are precisely the rot this catches: a broken command string,
references to uninstalled skills, a stale hardcoded path, seven lint rules
citing a document that doesn't exist.

**Four defects. None caught by a human in months. All four mechanically
detectable** — and that is in the *one* repo that gets the most attention.
Across a portfolio of experiments, the undetected rate is certainly worse.

# 12. Second pass — re-auditing Agent Office against the new lens

> Written after §§9-11. Same codebase, re-read with the lens those sections
> established: *map not manual · agent legibility · repo-local artifacts ·
> mechanical enforcement over prose · silence is a bug*.
>
> **Purpose:** find what else to fix in the harness **before** we start building
> smarter project boilerplates on top of it. A boilerplate generated by a harness
> with these defects would propagate them into every new project.

## 12.1 D5 · The trust-boundary rule is violated 34 times — including in the file the doc cites as its example

`docs/architecture.md:102-109` states the rule unambiguously:

> *"External or parsed data (request bodies, `JSON.parse` of on-disk files) enters
> as `unknown` and is **validated with Zod before use** — never cast to a
> concrete interface (`as SomeShape` is a lie the runtime can break) … the same
> rule applies to external files (e.g. `credentials.json` plan detection in
> `/api/account`)."*

Measured:

```
JSON.parse(...) cast directly to a type, non-test:   34 occurrences
```

Including the **exact file the rule names as its example**:

```ts
// packages/domain/src/services/accounts/accounts.ts:178
return JSON.parse(readFileSync(path, "utf-8")) as CredentialsBlob;
```

Others on agent-facing paths: `settings.ts` (`as Partial<AppSettings>`),
`skills.ts` (×4 — registry cache, provenance, manifest, compatibility),
`summon.ts` and `context-cost-measure.ts` (both parsing `~/.claude.json`),
`scheduled-jobs.ts` (`as SummonRequest` — a *scheduled spawn* built from
unvalidated DB JSON), `runs.ts` (`JSON.parse(line) as StreamEvent` — the CLI
stream itself).

**Severity: medium-high.** Same root as D4 and A48: an invariant that exists
only as prose is an invariant that is not enforced. Three for three now.

→ **A51 — lint the rule.** A `no-restricted-syntax` rule banning
`TSAsExpression` directly wrapping a `JSON.parse` call. The codebase already
uses exactly this technique for taste rules (the CSS-Grid selector in
`apps/web/eslint.config.mjs`), and already writes remediation into the message.
**S.**

## 12.2 F1 · 98.4% of all tool calls are Bash — and the harness pays for it

The app records every tool call. Over 362 runs:

| tool | calls |
|---|---:|
| **Bash** | **3,994** |
| Write | 36 |
| Read | 26 |
| Edit | 2 |

Breaking down the 1,998 Bash invocations by command:

```
  298 python3    264 echo     218 sed      212 grep    170 git
  131 cat         92 pnpm      87 gh        81 bash     58 ls
```

- **file reads via Bash** (`cat`/`head`/`tail`/`sed`/`wc`): **388** vs **26**
  native `Read` — ~94% of reading bypasses the structured tool
- **searches via Bash** (`grep`/`find`/`ls`/`awk`): **284**
- **`sed`: 218** invocations — many of them *edits* — vs **2** native `Edit`

**This is environment-caused, not model behaviour.** The bypass-permissions
system prompt explicitly steers agents away from the structured tools:

> *"Do your work through the Bash tool wherever it can accomplish the job: read
> files with cat, head, or sed -n … and make file changes with sed, heredocs, or
> short scripts, rather than using the dedicated Read, Edit, or Write tools."*

That may well be the right trade for speed. But the harness then silently pays
three bills:

1. **`subagent-parse.ts` has to regex Bash strings** — because essentially
   *everything* is a Bash string. This makes **A23** (let agents declare
   dispatches) materially more valuable than it looked in §5.4.
2. **Tool analytics are blind.** `analytics-page.ts:143-148` does
   `GROUP BY tc.name … LIMIT 12`. The shipped "tool usage" panel is a top-12
   chart in which one bar is 98.4% of the data. It is technically correct and
   informationally empty.
3. **Edits become unreviewable.** A native `Edit` carries `old_string` /
   `new_string` — structured, diffable, verifiable. `sed -i` is an opaque
   mutation. **This directly weakens the Loop (§10) and the Custodian (§11)**,
   both of which reason about *what changed*.

→ **A52 — make tool analytics command-aware.** Group Bash by parsed argv head
(`git`, `pnpm`, `sed`, `gh`…) instead of by tool name. The parsing already
exists in `subagent-parse.ts`. Turns a dead panel into a real one. **S.**

→ **A53 — decide the Bash-first trade deliberately, then commit to it.** Either
(a) keep steering to Bash and *invest* in it — treat Bash parsing as a
first-class subsystem, since it is 98% of observed behaviour; or (b) steer
file edits back to structured `Edit`/`Write` for reviewability while leaving
process/git work in Bash. **Recommend (b) for edits specifically**, because
§10 and §11 both depend on reviewable diffs. **M.**

## 12.3 F2 · Silence is still the default failure mode

```
catch blocks in packages/domain (non-test):            113
… that neither log nor rethrow:                         76  (67%)
```

Most are legitimately best-effort and say so (`/* best-effort */`,
`// backup failure must never block the save`). That is fine. The problem is
that **a legitimate silent catch and a D2-class bug are visually identical**,
so nothing distinguishes "deliberately ignored" from "accidentally swallowed".

→ **A54 — require an explicit marker on intentional silence**, e.g. a
`/* best-effort: <why> */` comment enforced by lint, so an unmarked silent catch
becomes a lint failure. Cheap, and it makes the next D2 visible. **S.**

## 12.4 F3 · Dead code — with one correction

**Correction (user, after first draft):** I wrote that the scheduler "has never
run in this install." **That was an overreach and the user uses schedules.**
What is actually provable:

- `deleteScheduledJob()` exists in `db/scheduled-jobs.ts` and has **zero
  callers** — jobs transition to `status: done` / `cancelled` and are never
  removed, so the row count is *cumulative*.
- `scheduled_jobs` currently holds **0 rows**.

Those two facts together mean no job exists in *this* database file — which is
consistent with a cleared DB (`/api/cleanup/everything` exists), a different
install, or a different account dir. **It is not evidence the feature is
unused.** Treat the scheduler as live; treat `deleteScheduledJob` as dead code
and the "done job" retention as an open question (they accumulate forever).

Still dead, and confirmed independently of row counts:

| signal | value |
|---|---|
| `/api/transcripts` client callers | **0** — the one hit is a comment saying it *"used to"* be used |
| `api/transcripts/route.ts` | 89 lines |
| `db/transcripts.ts` exported functions | **0** |
| `transcripts` table rows | 0 |

Already flagged as zero-caller in `docs/chat-refactor.md`.

→ **A55 — delete `/api/transcripts` + the dead transcript store.** **S.**

→ **A56 — decide `pipeline.ts`'s fate before building the Loop.** §10.1 argues
the Loop must extend `conversation-machine.ts` rather than become a third
execution path; `pipeline.ts` (417 lines) is the existing second path. Whether
it is used is now *unknown* rather than "never" — **check before §10 starts.**
**S to decide.**

→ **A57 — retention for finished scheduled jobs.** Nothing deletes them.
**S.**

## 12.5 What this means for the boilerplate work

The user's next step is *"smarter boilerplates for our projects."* Three of this
pass's findings argue for fixing the harness first:

1. **A boilerplate generator inherits the generator's blind spots.** The app
   already generates project scaffolding (`project-bootstrap.ts`), and it emits
   a root `CLAUDE.md` that is genuinely good (§11.1) — but Agent Office itself
   has none (D4), its stated rules are unenforced (D5, A48), and its own map is
   only generated on the greenfield path. **We would be shipping the same
   pattern into every new project.**
2. **The boilerplate should ship what we wish we had here:** a real root map, a
   `.ao/` directory, rules that are *mechanically enforced* rather than stated,
   and a lint whose error messages carry remediation (the one pattern this
   codebase already does well).
3. **Dogfood order matters.** Fixing D4 for Agent Office *is* the prototype of
   the boilerplate — do it once here, then template it.

## 12.6 Updated defect ledger

| id | defect | severity | change |
|---|---|---|---|
| **D1** | `historyNote()` emits an unrunnable `sqlite3` command | high | A1 |
| **D2** | 47 skill refs across 29 agents resolve to nothing, silently | high | A3, A35 |
| **D3** | Worktree facts hand-typed into agent bodies, with an unfilled placeholder | med-high | A18-A20 |
| **D4** | 7 lint rules cite a `CLAUDE.md` that does not exist | medium | §11.1, A42 |
| **D5** | Trust-boundary rule violated 34×, incl. its own cited example | med-high | **A51** |

**All five are mechanically detectable.** None was caught by a human. That is
the §11 argument, restated with a bigger sample.

# 13. Tool audit — what agents are actually given

> **Question (user):** *"double check each tool that we provide for the agent, do
> all tools work, how can we improve those … how can we make each agent's life
> easier?"* — prompted by §12.2's finding that 98.4% of tool calls are Bash.

## 13.1 The good news: nothing is broken

Every tool name declared across all 32 agents is a real Claude Code tool.
**No D2-style unresolvable references here.**

```
  32  Read        20  Glob        7  WebSearch      5  mcp__playwright__*
  31  Grep        14  Write       7  WebFetch       4  Task
  30  Bash        12  Edit
```

Every agent has a `tools:` field. Availability is not the problem.

## 13.2 The `tools:` field is honoured by the CLI, not by the app

`buildClaudeArgs()` never emits `--allowedTools`. The list is respected because
`--agent <id>` makes the **CLI** read the agent file directly. Agent Office uses
`info.tools` only for display (chips, search) and for context-cost estimation.

Consequence: **Agent Office never validates tool names.** A typo'd tool would
fail silently exactly like D2 — it just happens that none are typo'd today.

→ **A58 — validate tool names on save** against the known set (+ `mcp__*`
patterns), same surfacing as A35. **S.**

## 13.3 Granted ≠ used — the Bash monoculture is prompt-driven

| tool | agents granted | calls recorded |
|---|---:|---:|
| Grep | 31 | **0** |
| Glob | 20 | **0** |
| Read | 32 | 26 |
| Edit | 12 | 2 |
| Bash | 30 | **3,994** |

Grep and Glob are granted to most agents and have **never been called.** This
confirms §12.2: the cause is the bypass-permissions prompt steering agents to
`cat`/`sed`/`grep`, not tool availability. The grants are fine; the instruction
overrides them.

## 13.4 Six tools are granted to nobody

```
BashOutput   ExitPlanMode   KillShell   NotebookEdit   SlashCommand   TodoWrite
```

Three of those absences have real consequences.

### 13.4.1 `Task` — and the regex scraper it forces into existence

`Task` (native sub-agent spawn) is granted to only **4** agents:
`orchestrator`, `qa-code-review`, `qa-pen-testing`, `cs-boardroom`.

**`developer` — the main workhorse — does not have it.** So when it needs a
sub-agent it must shell out:

```bash
claude -p --agent reviewer "…"
```

…which is precisely what `subagent-parse.ts::parseClaudeBashSpawn()` exists to
regex out of Bash strings, falling back to *"the last quoted string is usually
the prompt."*

> **The scraper exists because of a missing tool grant.** Granting `Task` to the
> authoring agents converts inferred spawns into structured tool calls the app
> can read directly — **most of A23 solves itself for the price of a frontmatter
> edit.**

→ **A59 — grant `Task` to agents that dispatch** (`developer`, `planner`,
`frontend-craftsman`). Keep the regex as fallback (A24). **S — highest
value/effort ratio in this section.**

### 13.4.2 `BashOutput` / `KillShell` — an assumption worth testing

`background-shell-watcher.ts` justifies only waking agents whose owning run has
*finished*, with this reasoning:

> *"A still-running owning run means the agent is still in-turn and Claude's own
> in-session **BashOutput** polling is the live, better-informed path; don't
> race it."*

**But `BashOutput` is granted to no agent.** Two possibilities, and they have
different fixes:

1. The CLI grants `BashOutput`/`KillShell` implicitly alongside `Bash` — in
   which case the `tools:` list is not the whole story, and our UI/telemetry
   present an incomplete picture of an agent's real capabilities.
2. It does not — in which case the watcher's deferral is unsound, and **a
   background shell that dies while its run is still live is reported by
   nobody.**

→ **A60 — verify empirically** (one run: background a `sleep 5`, ask the agent
to poll it). Ten minutes, and it resolves either a telemetry gap or a real
reporting hole. **S.**

### 13.4.3 `TodoWrite` — no structured progress on long tasks

Granted to nobody, and the app has no equivalent. On the exact workload the user
cares about — *"features or big tasks"*, runs that can last hours — the only
progress signal is streamed prose. Nothing tells the UI *which step of what
plan* the agent is on.

This is the same gap as A46 (plans as first-class artifacts), approached from
the tool side.

→ **A61 — grant `TodoWrite` to authoring agents and surface the todo list in the
chat UI.** Turns a wall of text into visible progress, and gives the Loop (§10)
and the Custodian (§11) something structured to reason about. **M.**

## 13.5 Per-agent gaps worth closing

| agent | has | notably lacks |
|---|---|---|
| `developer` | Read, Write, Edit, Bash, Grep, playwright | **Task**, Glob, WebFetch, TodoWrite |
| `frontend-craftsman` | Read, Write, Edit, Bash, Grep, playwright | **Task**, Glob, WebFetch, TodoWrite |
| `orchestrator` | Read, Write, Edit, Bash, Grep, Task | Glob, WebFetch, TodoWrite |
| `planner` | Read, Bash, Grep, Glob | Task, WebFetch, TodoWrite |
| `qa-code-review` | Read, Bash, Grep, Glob, Task | WebFetch, TodoWrite |

- **`Glob` missing from `developer`/`frontend-craftsman`** while `Grep` is
  present — so file discovery falls back to `find` via Bash. Small, free fix.
- **`WebFetch` missing from `developer`.** Lived example: in this very session
  the agent had to fetch a URL, had no `WebFetch`, used `curl`, got **HTTP 403**,
  and needed a third-party reader proxy to recover. A granted `WebFetch` would
  have been one call.

→ **A62 — add `Glob` + `WebFetch` to the authoring agents.** **S.**

## 13.6 What "making each agent's life easier" actually means here

Ranked by value / effort:

| # | Change | Effort |
|---|---|---|
| **A59** | Grant `Task` to authoring agents — kills most of the spawn-scraping problem | **S** |
| **A62** | Grant `Glob` + `WebFetch` to authoring agents | **S** |
| **A58** | Validate tool names on save | **S** |
| **A60** | Empirically verify `BashOutput` availability | **S** |
| **A52** | Group Bash telemetry by command, not tool name | **S** |
| **A61** | `TodoWrite` + surface todos in the UI | **M** |
| **A53** | Steer file *edits* back to structured `Edit`/`Write` for reviewability | **M** |

Five of the seven are small. **A59 alone removes a whole class of inference the
harness currently pays for**, and it is a frontmatter edit plus a fallback path
that already exists.

## 13.8 Todos — partially built, never wired up

**Answer to "was that ever built?": the *grant* was built, the *feature* wasn't.**

| piece | status |
|---|---|
| `TodoWrite` offered as a tickable tool in the agent editor | **exists** — `agent-editor-form.tsx:70`, `{ id: "TodoWrite", desc: "Task list" }` |
| `TodoRead` / `TodoWrite` documented in the API export | **exists** — `docs-export.ts:793-794` |
| Any agent actually granted it | **none** |
| `TodoWrite` calls ever recorded | **0** |
| DB table for todos | **none** |
| UI that renders a todo list | **none** — it would land as a generic tool row |

So someone built the *ability to grant* it, documented it, and stopped. Nothing
stores or displays todos, so even if granted today they would stream past as
undifferentiated tool calls.

To get what the user described — *"agents create todos so I can easily access and
read them"* — three pieces are needed, only one of which is a grant:

1. **Grant** `TodoWrite` to authoring agents *(trivial)*
2. **Persist** todo state per run/conversation — the `tool_calls` table already
   captures the payload, so this is mostly a read model *(small)*
3. **Render** it as a live checklist in the chat UI *(the actual work)*

→ **A61 (revised)** — grant + persist + render. Note this is the same need as
**A46** (plans as first-class artifacts) coming from the tool side; build them
together, not twice. **M.**

## 13.9 Recommended grant matrix for the "smart" agents

Current state and the proposed change. `+` = add.

| agent | today | add | why |
|---|---|---|---|
| **developer** | Read, Write, Edit, Bash, Grep, playwright | **+Task +Glob +WebFetch +TodoWrite** | Task kills the spawn-scraping (§13.4.1); it had to `curl` a URL this session and hit a 403 |
| **frontend-craftsman** | Read, Write, Edit, Bash, Grep, playwright | **+Task +Glob +WebFetch +TodoWrite** | same workload as developer |
| **orchestrator** | Read, Write, Edit, Bash, Grep, Task | **+Glob +WebFetch +TodoWrite** | it dispatches; todos are its natural output |
| **planner** | Read, Bash, Grep, Glob | **+Write +TodoWrite** | **a planner that cannot write a plan file.** Direct blocker for A46 |
| **agent-architect** | Read, Write, Bash, Grep | **+Edit +Glob** | it authors agent files but **cannot edit existing ones** |
| **cs-\*** (ceo/cto/cfo/coo/cpo/cmo) | Read, Bash, Grep, Glob, WebSearch, WebFetch | **+Write** | advisors produce strategy docs that currently exist only in a transcript |
| **cs-boardroom** | Read, Bash, Grep, Glob, Task | **+Write +WebSearch +WebFetch** | inconsistent: every individual C-suite agent has web access, the boardroom doesn't |
| **qa-code-review** | Read, Bash, Grep, Glob, Task | *(none)* | correctly read-only — **do not grant Write** (§10.3 F2) |

**Permissions:** every agent above is already `bypassPermissions`. That is
consistent and appropriate for a local trusted harness — no change proposed.

**Playwright:** declared by `developer`, `frontend-craftsman`, `qa-visual`,
`web-qa`, +1. The on/off toggle already exists end-to-end
(`AgentInstance.playwrightEnabled` → `mcpArgsWithoutPlaywright()` →
`--strict-mcp-config`), and it is the *correct* pattern — it strips the server so
its tool schemas never enter context. **No change needed; it already works the
way the user asked for.** → verify once in Wave 0 (A60-adjacent).

## 13.7 The meta-point

Nothing in the tool layer is broken. What is wrong is **fit**: the tools granted
do not match the work the agents actually do, and a system prompt pushes them
off the structured tools onto Bash — after which the harness spends real
engineering effort (`subagent-parse.ts`, background-shell polling, a blind
analytics panel) reconstructing information the structured tools would have
handed over for free.

**We built workarounds for capabilities we simply hadn't granted.**

# 15. Design: the permission channel

> **Goal (user):** *"finalize the bypass-permissions functionality and have the
> ability to switch this somewhere in a chat window, but then we'd need to wire
> properly messages from the agent when it's asking for permission to do X."*
> **Question asked:** how big is this?
> **Answer:** medium — and **most of the cost is shared with work already on the
> list**, so it is cheaper than it looks. Details in §15.5.

## 15.1 The current state is a documented workaround, not a choice

`packages/domain/src/config/agent-opts.ts` already says this out loud:

> *"Every agent is summoned headless via `claude -p` with no interactive TTY, so
> a tool call that would need a live prompt has nothing to prompt — the CLI
> denies it outright. **`bypassPermissions` is the only mode that reliably lets
> an agent finish unattended work today**, which is why all bundled agents ship
> with it. `default` still denies unattended prompts (**no live approval channel
> exists yet** — tracked in `docs/redesign-v3/REDESIGN_V3_PLAN.md`)"*

Two things follow:

1. **Every agent running `bypassPermissions` is not a security posture — it is
   the absence of a channel.** This is §13.7's pattern again: a workaround for a
   capability we never built.
2. **That referenced plan does not exist.** `docs/redesign-v3/` is missing
   entirely. So is `docs/component-conventions.md`, also cited from code. Two
   more citations into a void — same class as **D4**.

→ **A63 — lint dangling `docs/*.md` references from code.** Three instances
found so far (D4's CLAUDE.md, plus these two). **S.**

## 15.2 The CLI already supports everything needed

Verified against the installed CLI (**v2.1.278**):

```
--permission-mode <mode>        acceptEdits | auto | bypassPermissions |
                                manual | dontAsk | plan
--permission-prompts <target>   "host"  = the SDK host or --permission-prompt-tool
                                "none"  = anything that would prompt is auto-denied
                                (default: "host")
--permission-prompt-tool <t>    accepted by this build (not listed in --help,
                                but does not error — verified)
```

The app offers **3** of the 6 modes (`PERMISSION_MODE_OPTS = ["bypassPermissions",
"default", "plan"]`). `acceptEdits`, `auto`, `manual` and `dontAsk` are
unavailable purely because nothing can answer a prompt.

**The default is already `host`.** The CLI is waiting for a host that never
answers.

## 15.3 The design

Agent Office runs a tiny MCP server exposing **one** tool, and nominates it as
the permission handler:

```
 CLI needs permission for Bash("rm -rf …")
        │
        ├─ calls  mcp__ao__permission_prompt { tool, input, runId }
        │
   Agent Office (in-process MCP handler)
        │  registers a pending decision, returns a Promise
        ├─ SSE: { name: "permission-request", data: { runId, id, tool, input } }
        │
   Chat UI renders an Approve / Deny card  ◄── same slot as the rate-limit card
        │
   POST /api/runs/:id/permission { id, decision }
        │
        └─ resolves the Promise → tool returns allow/deny → CLI continues
```

### Why this shape

- **`--mcp-config` plumbing already exists.** `summon.ts::mcpArgsWithoutPlaywright()`
  already builds an MCP server set and passes `--strict-mcp-config`. Adding one
  more server to that JSON is a small change to code that already ships.
- **The rate-limit card is the UI precedent** — a non-message card rendered in
  the chat thread with actions. Same pattern, different payload.
- **`needs_attention` already exists** for the timeout path.
- No change to the conversation state machine: a run awaiting permission is
  still `running`, merely blocked. Only the **timeout** transition touches state.

### Non-negotiables

| Risk | Mitigation |
|---|---|
| **User is away; run hangs forever** holding a process and a sleep inhibitor (`acquireInhibit`) | **Hard timeout → auto-deny**, configurable. Never block indefinitely. On timeout, set `needs_attention` |
| Prompt storms on a chatty agent | "Approve all `Bash` for this run" / remember-per-session decisions (v1) |
| A blocked run silently eats its wall-clock / budget ceiling | Pause the run's clock while awaiting a decision, or exclude wait time from the cap |
| Decision arrives after the run died | Resolve against `runId` + decision `id`; ignore stale — same guard `runFinished` already uses |

## 15.4 The chat-window switch

The resolution chain already exists in `summon.ts`:

```ts
const permissionMode = instance?.permissionMode ?? agent.permissionMode;
```

Add a per-send override exactly as proposed for the Loop toggle (§10.6):

```ts
request.permissionMode ?? instance?.permissionMode ?? agent.permissionMode
```

`SummonRequest` already carries `model` / `effort` / `maxBudgetUsd` this way, and
`validation-schemas.ts` already has `permissionMode: z.string().optional()` in
three places. **The plumbing is present; only the UI control and the per-send
wiring are missing.**

Once a prompt handler exists, `PERMISSION_MODE_OPTS` can expand to the full CLI
set and the comment in `agent-opts.ts` can be deleted rather than updated.

## 15.5 Sizing — and why it is cheaper than it looks

| Piece | Size | Notes |
|---|---|---|
| MCP server with one tool, in-process | **M** | **New infrastructure — but see below** |
| Add server to `--mcp-config` + `--permission-prompt-tool` | **S** | extends existing `mcpArgsWithoutPlaywright()` |
| Pending-decision registry keyed by run | **S** | same shape as the existing `liveRuns` map |
| SSE event + client handling | **S** | `SseEventName` union already exists |
| `POST /api/runs/:id/permission` | **S** | ~20-line route, standard shape |
| Approve/Deny card in chat | **M** | rate-limit card is the template |
| Timeout → auto-deny → `needs_attention` | **S** | |
| Per-send mode switch | **S** | resolution chain + schema already exist |
| Expand `PERMISSION_MODE_OPTS` to all 6 | **S** | |

**Overall: M-L — but the MCP server is the same server that §9 Phase 3 needs.**

That is the important scoping point. Once this exists:

- **A25 (`office_ask_user`)** — an agent asking the user a *question* is the same
  round trip as asking permission. Nearly free afterwards.
- **A33 (`/api/docs/export` consumer)**, **A29 (agent-writable memory)**,
  **A23 (declared dispatch)**, **office_history (D1's real fix)** — all become
  "add a tool to a server that already runs" rather than "build a server."

So the honest framing is not *"how big is the permission channel"* but
***"the permission channel is the cheapest reason to finally build the MCP
server, and it pays for four other items on the list."***

## 15.6 Sequencing

**v0 — the channel.** MCP server + one tool + SSE event + approve/deny card +
timeout. Ship with `bypassPermissions` still the default so nothing regresses.

**v1 — the switch.** Per-send mode control in the composer; expand
`PERMISSION_MODE_OPTS` to all six; "approve all X for this run".

**v2 — sane defaults per agent.** With a working channel, `developer` could
default to `acceptEdits` (file edits silent, shell commands prompted) rather than
`bypassPermissions`. **This is the point at which the app gets a real security
posture instead of an absent one.**

**v3 — reuse the server** for A25/A23/A29/A33 (§9 Phase 3).

> **Prerequisite:** none technically — but do **Wave 0** first anyway. Adding an
> MCP server changes what every agent sees in context, and right now we cannot
> see the assembled prompt (A9) or test it (A37). Build the mirror before
> changing the reflection.

# 16. Comment discipline — why agents over-comment, and the cheap fix

> **Problem (user):** *"agents leave shit tons of comments, overcomplicating
> simple things, no commenting rules, there's places where comments shouldn't
> even exist like types files. How can we cheaply solve this?"*

## 16.1 The instruction already exists — and loses

`developer.md` already says, in its very first paragraph:

> *"No comments unless the why is non-obvious."*

That rule is in the system prompt of **every** `developer` run and is being
ignored. Adding a louder version of it will not work, because the cause is not
missing instruction.

## 16.2 The cause: agents copy the repo, and the repo is comment-dense

| area | comment lines | code lines | ratio |
|---|---:|---:|---:|
| `packages/domain` | 2,223 | 11,782 | **18.9%** |
| `apps/web` `.ts` | 2,947 | 14,746 | **20.0%** |
| `apps/web` `.tsx` | 2,653 | 31,164 | 8.5% |

**Roughly one comment line per five lines of code** in the TypeScript core.

Files at ≥35% comments (12 of them):

```
 63%   modules/office/pixi/elevation.ts
 62%   lib/performance-store.ts
 49%   services/execution/conversation-machine.ts
 48%   modules/summon/format/message-format.ts
 47%   modules/summon/state/run-stream-registry.ts
 46%   services/execution/conversation.ts
 40%   services/execution/runs/types.ts        ← a types file
```

This is exactly the failure mode §9 quotes from OpenAI:

> *"Codex replicates patterns that already exist in the repository — even uneven
> or suboptimal ones. Over time, this inevitably leads to drift."*

**The repository is the strongest prompt in the system.** A one-line rule in a
system prompt cannot outvote 5,000 comment lines of demonstrated house style.
Any fix that is only prose will fail the same way this one already has.

## 16.3 Why "write better commenting rules" is the wrong fix

Defining *good* commenting in prose means encoding taste — which is the
1000-page-manual trap (§0). It costs resident tokens on every turn, it cannot be
verified, and it rots. Three strikes.

**Encode only the mechanically-detectable bad cases. Let the rest go.**

## 16.4 The cheap fix — three parts, ~1-2 hours

### Part 1 · Ratchet, don't cliff *(the important one)*

A hard ratio ceiling would fail 12 existing files on day one, so it would be
turned off within a week. Instead:

- record the current comment ratio per file as a **baseline** (one JSON file)
- CI/lint fails only when a file's ratio **increases**
- new files get the target ceiling from birth

This stops the bleeding immediately at near-zero cost, requires no refactor, and
converts "clean up 5,000 comments" into "never add the 5,001st".

### Part 2 · Ban the three detectable patterns

A small custom ESLint rule (~40 lines, `sourceCode.getAllComments()`):

| pattern | detection |
|---|---|
| **Comments in type-declaration files** | file matches `types/**` or `*.types.ts` → allow only JSDoc `/** */` on exported symbols, ban `//` |
| **Restated code** — *"// increment the counter"* | every word of the comment appears in the following line's identifiers |
| **Commented-out code** | a `//` line that parses as valid TS |
| **Section dividers** — `// ─── X ───` | matches `^[/\s*]*[─=—-]{3,}` |

These four are objective. Everything else is taste, and is left alone.

### Part 3 · Remediation in the message

Following the precedent this codebase already sets — the CSS-Grid rule in
`apps/web/eslint.config.mjs` says *"use Flexbox (flex + flex-wrap + basis-* /
w-* / flex-1)"* — the comment rule's message must state the fix:

```
"Comment restates the code. Delete it, or rewrite it to explain WHY
 (a constraint, a gotcha, a decision) — never WHAT."
```

**This is the real trick: the agent does not need the rule in advance.** The
failure teaches it, at the exact line, at the exact moment. Zero resident
tokens — the opposite of a manual. (Same mechanism as **A43**.)

## 16.5 What this does *not* need

- ❌ A commenting section in every agent body — that is the manual again, ×32 agents
- ❌ A prose style guide — unverifiable, rots
- ❌ A big comment-stripping refactor — the ratchet makes it unnecessary
- ✅ One line in the *house* rules layer (§11.3), stated once and inherited

## 16.6 Where it fits

| # | Change | Effort |
|---|---|---|
| **A64** | Comment-ratio ratchet: baseline file + regression check | **S** |
| **A65** | Custom lint for the four detectable patterns, with remediation text | **S** |
| **A66** | One line in the house-rules layer — *"comments explain WHY, never WHAT"* | **S** |

All three land in **Wave 2** (make invariants mechanical) — they are the same
shape as A48/A51/A54 and share the same lint scaffolding.

Afterwards, the Loop (§10) catches judgement cases at review time with a
*citable* rule id, rather than a reviewer inventing a standard per run.

> **The general lesson, worth keeping:** when an agent misbehaves and the
> instruction already exists, **the repository is out-voting the prompt.** Fix
> the repository signal or make the rule mechanical — never just say it louder.

# 17. Credential friction — the agent doesn't know it already has access

> **Problem (user):** *"I have github and claude credentials added to the Agent
> Office app, configured per project, but in the chat with an agent I have to
> give it once more which is tedious… is this possible or too much trouble for
> something with so little impact?"*
> **Verdict: cheap (~15 lines) and higher impact than it looks.** It is the same
> defect class as D1-D5 — the app knows something the agent is never told.

## 17.1 Diagnosis

`buildProjectEnvironmentBlock()` tells an agent about its GitHub identity **only
when a non-default account is bound to the project**:

```ts
if (project.meta.githubAccountId) {            // ← unset for most projects
  lines.push(`- GitHub: \`git push\` and \`gh\` authenticate as "${gh.label}" …`);
}
```

Measured on this machine:

| | value |
|---|---|
| GitHub accounts registered in Agent Office | **only `default`** |
| `githubAccountId` on the Agent Office project | **unset** |
| `accountId` (Claude) on the same project | `acc_7c3c521e173a` ✓ |
| What `spawn-env.ts` injects for a default GitHub account | **nothing** — inherits system `gh`, by design |
| What the agent is therefore told about GitHub | **nothing** |

So the agent has working `gh` credentials, has no idea they exist, does not know
which identity it is, **and asks the user.** Every run.

Meanwhile the Claude account *is* announced (`- Claude account: … (plan)`) and
secrets *are* announced (`- Secrets in your environment: …`). GitHub is the one
gap — and only because the announcement is gated on a binding most projects
don't set.

## 17.2 The fix

Announce the **effective** identity, not just an explicitly-bound one. The
system identity is a plain file read — **no network call, no token access**:

```
~/.config/gh/hosts.yml
  github.com:
      user: nakotomagami-a11y      ← this is all that's needed
```

```ts
// in buildProjectEnvironmentBlock
const gh = project.meta.githubAccountId
  ? githubAccounts.get(project.meta.githubAccountId)?.label   // bound account
  : readSystemGhUser();                                        // hosts.yml → `user:`
if (gh) lines.push(
  `- GitHub: \`git push\` and \`gh\` are already authenticated as "${gh}". ` +
  `This is the only GitHub identity in your environment — never switch, re-auth, ` +
  `or ask the user for credentials.`
);
```

That last clause matters as much as the identity: it tells the agent **not to
ask**, which is the behaviour being complained about.

→ **A67 — announce the effective GitHub identity (bound *or* system).** ~15
lines, no new dependency, no network. **S.** Lands in **Wave 3** with the rest
of the environment-block work (A19), or earlier — it is independent.

## 17.3 Worth doing? Yes, and not only for the tedium

1. **It removes a recurring interruption** — the stated complaint.
2. **It prevents wrong behaviour, not just slow behaviour.** An agent that
   doesn't know it has credentials may guess, try to re-authenticate, or switch
   accounts — all worse than asking.
3. **It closes the last gap in a pattern that is otherwise complete.** Claude
   account ✓, secrets ✓, GitHub ✗. Finishing it costs almost nothing.

## 17.4 Optional polish (not required)

- Show the effective Claude + GitHub identity in the chat composer, so the human
  sees which credentials a run will use *before* sending.
- Use the same `readSystemGhUser()` to warn when a project's bound account and
  the system account disagree — a silent mismatch is how "pushed as the wrong
  user" happens.

# 14. THE PLAN

> Everything above is findings. **This is the execution order.** Waves are sized
> to one working session each and ordered by *what unblocks what* — not by size.
> Each wave has an explicit exit check, because a wave you can't verify isn't done.

## 14.0 First, the honest scorecard on dead code

The user asked for dead functionality and things that make no sense. Measured:

| check | result |
|---|---|
| API routes with no caller outside `app/api/` | **1 of 119** (`/api/dev/backfill-planets`, a dev utility) |
| Exported domain functions with zero references | **11** |
| Genuinely dead subsystem | **1** — `/api/transcripts` (89 lines, 0 callers) |

**The codebase is not full of dead code.** 118 of 119 routes are live. That is a
well-maintained surface and it deserves saying plainly rather than inflating a
list.

The 11 dead exports, for the record: `enqueueMessage`, `dequeueMessage`,
`queueLength` (`db/conversations.ts`), `listPipelines`,
`getInterruptedPipelines` (`pipeline.ts`), `listBackgroundShellPidsForRun`,
`searchMessages`, `getSumCostSince`, `deleteScheduledJob`,
`initialConversationState`, `readProjectMemory`.

> **The real problem was never dead code.** It is (a) invariants that exist only
> as prose and are therefore violated — D4, D5, A48; and (b) capabilities we
> never granted and then built workarounds for — §13.7. Both are cheap to fix
> and neither shows up as "dead code."

## 14.1 Wave 0 — Unblock and build the mirror · ~1 session

**Goal:** close what is provably broken, and make the agent-facing surface
*visible* so the next regression is caught by a machine instead of an audit.

| # | Task |
|---|---|
| — | `pnpm install` at repo root — **nothing below can be verified without it** (root `node_modules` has 1 entry) |
| **A1** | Fix `historyNote()` tilde quoting (**D1**) |
| **A3** | Loud failure for unresolvable skills (**D2**) — warn + UI badge |
| **A58** | Validate tool names on save |
| **A9** | Dump the assembled prompt per run to a debug path |
| **A37** | Snapshot-test `composeAppendedPrompt()` for a fixture agent |
| **A38** | Smoke-test every shell string emitted into a prompt |
| **A60** | Empirically verify `BashOutput` availability (§13.4.2) |
| **A56-decide** | Determine whether `pipeline.ts` is live — **gates Wave 5** |

**Exit check:** `pnpm lint && pnpm typecheck` green · snapshot test passes ·
the sqlite command printed into a prompt actually runs · an agent with a bogus
skill shows a badge · you can read the exact prompt a run received.

## 14.2 Wave 1 — Tool grants · ~half a session

**Do this first if you only do one thing.** No dependencies, pure frontmatter,
and it removes a class of work the harness currently pays for.

Apply §13.9's grant matrix. Headline: **`Task` to `developer` /
`frontend-craftsman`** (kills most of the spawn-scraping), **`Write` to
`planner` and the C-suite**, **`Edit` to `agent-architect`**.

**Exit check:** re-run the tool-usage query after a week of normal work —
`Task` calls should be non-zero and `parseClaudeBashSpawn` hits should fall.

## 14.3 Wave 2 — Make invariants mechanical · ~1 session

**Goal:** stop the D4/D5/A48 pattern at the root. Three lint rules and one
document.

| # | Task |
|---|---|
| **A48** | eslint: `packages/domain` must not import `@/` |
| **A51** | eslint: ban `JSON.parse(...) as T` (**D5**, 34 sites) |
| **A54** | eslint: unmarked silent `catch` is an error; `/* best-effort: why */` exempts |
| **D4 fix** | Write the real root `CLAUDE.md` / `docs/conventions.md`; make the 7 lint messages cite rule IDs that resolve |
| **A43** | Remediation text on every `RunErrorCode` |
| **A64** | Comment-ratio ratchet (baseline + regression check) — §16 |
| **A65** | Custom lint: comments in types files, restated code, commented-out code, divider bars |
| **A66** | One line in the house-rules layer: comments explain WHY, never WHAT |

**Exit check:** every lint message cites something that exists · the 34 D5 sites
are either fixed or explicitly waived · `grep -c CLAUDE.md eslint.config.mjs`
resolves to a real file.

> **This wave is also the prototype for the project boilerplate.** Do it once
> here, verify it, then template it (§12.5).

## 14.4 Wave 3 — The project map · 1-2 sessions

**Goal:** agents stop being told the project's facts by hand.

| # | Task |
|---|---|
| **A11** | Move command detection out of `apps/web/src/lib/server/` into `packages/domain` — **unblocks the rest** |
| **A42/A12** | Project map: `CLAUDE.md` as ~100-line TOC + `.ao.json` for executable commands |
| **A15** | Auto-generate a first draft on onboarding — promote `writeRootClaude()` off the bootstrap-only path (§11.1) |
| **A13** | Inject the map into the prompt |
| **A16/A17** | Repo tree digest + live git status into the prompt |
| **A19** | Worktree facts into the env block |
| **A67** | Announce the effective GitHub identity (bound *or* system) — §17 |
| **A18** | `POST /api/projects/:id/roster/:instanceId/deliver` |
| **A20** | Delete the now-redundant hand-written sections from agent bodies (**D3**) |

**Exit check:** a fresh project gets a map with zero manual setup · the prompt
contains live branch/commands/paths · `developer.md`'s worktree ritual is gone.

## 14.5 Wave 4 — Context tiering · 1-2 sessions

**Goal:** stop shipping manuals. Measurable.

**A5/A6** implement `phase: always | first-turn | on-demand` ·
**A4** classify agent bodies by size like skills already are ·
**A7** split bodies into identity + `procedures/*.md` behind pointers ·
**A8** suppress hand-written skill prose when the real system resolves ·
**A31** map of available memory instead of inlining all of it.

**Exit check:** re-run the §4.1 measurement. **Mean resident body should drop
from ~913 tokens toward a few hundred.** If it doesn't, the wave failed.

## 14.55 Wave 4.5 — The permission channel · §15 · 1-2 sessions

**Goal:** stop shipping `bypassPermissions` as a substitute for a channel.

MCP server with one `permission_prompt` tool → SSE event → approve/deny card in
chat → timeout auto-deny. Then the per-send mode switch and the full six-mode
`PERMISSION_MODE_OPTS`.

**Why it sits here:** it needs Wave 0's mirror (adding an MCP server changes
every agent's context — don't do that blind), and it *builds the MCP server that
§9 Phase 3 needs anyway*. A25, A23, A29, A33 all become cheap afterwards.

**Exit check:** an agent in `acceptEdits` mode prompts for a shell command and
the run continues after approval · an unanswered prompt auto-denies on timeout
instead of hanging · `agent-opts.ts`'s "no live approval channel exists yet"
comment can be **deleted**, not updated.

## 14.6 Wave 5 — Loop v0 · §10

**Blocked on:** A56 (Wave 0). **Stronger after:** Wave 2 (rules to cite) and
Wave 3 (project conventions).

One reviewer, local, worktree-scoped, verdict file, three ceilings, per-send
toggle. Renders in the existing run-tree UI.

**Exit check:** a deliberately sloppy change is blocked with a cited MUST-FIX ·
budget ceiling breach escalates to `needs_attention` rather than looping.

## 14.7 Wave 6 — Custodian v0 · §11

Read-only: map refresh → rule resolution → scan → classify → report.
Then v1 nightly on the scheduler, then v2 grades/trends.

**Exit check:** running it against Agent Office itself re-discovers D1-D5
**without being told about them.** That is the acceptance test.

## 14.8 Wave 7 — Cleanup · anytime, low priority

**A55** delete `/api/transcripts` · **A57** retention for finished scheduled jobs ·
delete the 11 dead exports · **A52** command-aware tool analytics ·
**A36** prune `.body.*` history · **A34** restructure `agents/` storage.

## 14.9 Explicitly deferred — not in this plan

| item | why |
|---|---|
| **Auto-fix + fix PRs** | user decision — per project, at the very end (§11.6) |
| **MCP tool surface** (A23 full, A25, A29, A33) | Wave 1's `Task` grant delivers most of A23's value for a frontmatter edit. The rest rides on **Wave 4.5**, which builds the server anyway |
| **GitHub loop** (§10.7) | app has no PR concept; weeks of work for collaboration value we don't need yet |
| **App bootable per worktree** (A47) | flagship, but only worth it after Wave 3 |
| **Quality grades / cross-project learning** (A45, §11.9) | needs the Custodian running first |
| **The office / PixiJS** | not a problem. Keep it. It just must stop absorbing the effort budget |

## 14.10 If you only have one day

**Wave 1 (30 min) + Wave 0 (rest of day).**

Wave 1 because it is free and removes work the harness is currently doing by
hand. Wave 0 because until the prompt is visible and tested, every other change
is being made blind — which is exactly how five defects survived this long.

# Appendix — reproducing the measurements

```bash
# D1
sqlite3 "~/.claude/agent-office/db.sqlite" "SELECT 1"   # fails
sqlite3  ~/.claude/agent-office/db.sqlite  "SELECT count(*) FROM messages"  # 642

# D2
ls ~/.claude/agents/_skills                  # 4 installed
grep -h "^skills:" ~/.claude/agents/*.md     # 47 referenced, 0 overlap

# 4.1 / 4.2 — body sizes and section breakdown
#   see scripts in this session's transcript; pure stdlib python3, no deps

# 4.3
grep -n 'phase: "' packages/domain/src/services/agents/agents.ts   # all "always"

# D4 — follow the citation chain the lint rules inject into agent context
grep -c "CLAUDE.md" apps/web/eslint.config.mjs   # 7 citations
ls CLAUDE.md ~/.claude/CLAUDE.md ~/.claude/agents/_global.memory.md   # all MISSING
wc -c apps/web/CLAUDE.md                         # 11  -> contents: "@AGENTS.md"
cat apps/web/AGENTS.md                           # Next.js auto-generated block only

# A48 — the layering invariant is prose-only
grep -n "no-restricted-imports" packages/domain/eslint.config.mjs   # no matches

# D5 — trust-boundary rule violated, incl. the file architecture.md cites
grep -rn "JSON.parse(" --include="*.ts" packages/domain/src apps/web/src \
  | grep -v test | grep -c " as "                # 34
grep -n "CredentialsBlob" packages/domain/src/services/accounts/accounts.ts

# F1 — 98.4% of tool calls are Bash
sqlite3 ~/.claude/agent-office/db.sqlite \
  "SELECT name, count(*) c FROM tool_calls GROUP BY name ORDER BY c DESC"

# F3 — dead code (note: row counts are NOT proof of disuse, see §12.4)
grep -rn "deleteScheduledJob" packages/domain/src apps/web/src | grep -v db/  # 0 callers

# §13 — tool grants vs usage
grep -h "^tools:" ~/.claude/agents/*.md            # all names valid; Task on only 4
sqlite3 ~/.claude/agent-office/db.sqlite \
  "SELECT name, count(*) FROM tool_calls GROUP BY name"   # Grep/Glob: absent
```
