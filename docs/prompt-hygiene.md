# Prompt hygiene: keeping agent prompts current

Agent prompts collect sediment. A line written to push an older model ("think hard", "double-check", "ask one
question at a time") stays in the file long after the model it was written for is gone, and current models
follow it to the letter: it costs time and tokens, or backfires. Anthropic said as much when Opus 5.5 shipped
([the-decoder summary](https://the-decoder.com/anthropic-says-outdated-prompting-habits-are-slowing-down-claude-opus-5-5/)).
This doc says how Agent Office keeps its prompts current, and what the 2026-11 audit found and changed.

## Three layers keep it current

| Layer | Catches | Where |
|---|---|---|
| **Test** | Shipped agents that declare a skill that doesn't ship, pin a model, use an unknown effort, or carry a dated cue or placeholder path; `MODEL_CATALOG` older than the bundled `claude-api` skill's model table | `prompt.*` in `docs/conventions.md`, enforced by `packages/domain/src/services/agents/starter-data-prompts.test.ts` |
| **Skill updates** | A bundled skill that moved on upstream. Every skill from `anthropics/skills` carries a `.source.json`, and the Skills page offers the update | `services/skills/skills.ts` |
| **Weekly check** | What no test can see: new models, new prompting guidance, drift in your own installed agents and memory files | A recurring order on the Schedules page that runs the procedure below |

The test guards what ships. Your installed agents in `~/.claude/agents/` are user data: the in-app migration
offers the shipped versions when the bundle changes, and the weekly check reports drift in the rest.

## The weekly check

The recurring order runs this procedure. It reports and edits nothing; you decide what to apply.

1. **Skills.** For each `~/.claude/agents/_skills/*/.source.json`, compare `sha` with
   `gh api repos/<source>/contents/<path>/SKILL.md --jq .sha`. List the skills that moved.
2. **Models.** Compare `MODEL_CATALOG` in `packages/domain/src/config/models.ts` with Anthropic's models overview
   (https://platform.claude.com/docs/en/about-claude/models/overview). List any family whose newest id is newer.
3. **Guidance.** Read the prompting guide for each current model
   (https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices and
   the per-model pages it links). List guidance that is new since the date at the top of the last report.
4. **Prompts.** If step 1, 2 or 3 found something, or a month has passed since the last full audit, run the
   audit in `~/.claude/agents/_skills/claude-api/shared/prompt-audit.md` over `~/.claude/agents/*.md`,
   `~/.claude/agents/_global.memory.md` and `apps/web/starter-data/agents/`. Use the current guidance table below
   as the baseline.
5. **Report.** If nothing changed, reply `No prompt drift` with the date and stop. Otherwise reply with the
   findings (file:line, what, why it is outdated, the fix), most costly first.

The house preferences below are the user's decisions. Don't report them as drift.

## House preferences

- **Effort stays `high` by default.** Most work here is heavy-logic software. Anthropic's general advice is to
  start at `medium` on Opus 5.5; the founder chose `high`.
- **Reviews run on Opus**, at `high` (`qa-code-review`, `security-engineer`), so they hunt real bugs and design flaws, not just style.
- **QA runs before a PR**, or when the user asks, not on every diff. The agent checks its own work first.
- **Long sessions are protected**: agents keep `NEXT_SESSION.md` current after each milestone, so a run cut
  off by a rate limit, crash or compaction loses nothing.
- **Fable is human-dispatch only.**

## Current guidance (2026-11)

| Old habit | Current guidance |
|---|---|
| "think hard", "think carefully", "step by step" | Thinking is always on and set by effort. Delete the cue. |
| "verify twice", "double-check", "use a subagent to verify" | Opus 5+ checks its own work. Keep one line for agents that change code: run a real check that exercises the change before reporting done. |
| Sonnet for cheap work | Judge cost per finished task. Sonnet above `high` effort costs about as much as Opus. |
| Standing orders to delegate | Delegate only parallel, independent, sizeable work. |
| One question per turn, interview first | Find facts yourself; ask the open decisions in one numbered round with recommended answers (Matt Pocock's `grilling`). |
| Draft or outline first, then wait | Produce the finished thing; confirm only before overwrites or destructive steps. |
| `never` / MUST / CAPS without a reason | Models take "never" literally and caution piles up. Give the scope, the reason and the alternative. |
| Rigid procedures, self-review checklists, hard word counts | Followed to the letter. Describe the goal and the finished output. |
| "Avoid AI slop" | Name the patterns: cream/off-white background, pill buttons, italic accent words, 01/02/03 section labels, monospace eyebrow labels, purple gradients. |
| "Only report high-severity issues" | Followed literally. Report everything with a severity label. |

Sources: [Using Claude Opus 5.5 as your daily driver](https://claude.com/resources/articles/using-claude-opus-5-5-as-your-daily-driver-for-knowledge-work),
[Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices),
[Prompting Claude Opus 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5),
[Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5),
[Sonnet 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5-5),
[Fable 5.2](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2),
[Optimizing for cost and intelligence](https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence),
[mattpocock/skills `grilling`](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling).

## 2026-11 audit: what was found and changed

Audited 2026-11-15: all agents in `~/.claude/agents/`, the shipped starter agents and skills, the built-in
response style, the prompt assembly and 30 days of runs.

| Found | Changed |
|---|---|
| `developer` had to send every diff to a QA subagent; 21 agents declared `sp-verification-before-completion` | QA runs before a PR or on request; one "run a real check" line for agents that change code |
| `qa-code-review`, `qa-pen-testing`, `security-posture` ran on Sonnet at `xhigh` (about Opus cost) | Opus at `high`; `qa-code-review` now traces callers and edge cases, not just the diff. The two security agents later merged into `security-engineer` (review, or fix with a regression test), and `qa-visual` into `web-qa` |
| Six agents interviewed one question per turn (`alz-grill-me`); `agent-architect` looped draft → approval | One round of open decisions with recommended answers; "grill me" runs full rounds; architect shows the finished file and writes it on approval |
| Mandatory `NEXT_SESSION.md` as the last action of every run, small or not | Updated after each milestone on long work (survives an interrupted run); skipped for questions and small edits |
| Dev servers: the same `nohup` recipe repeated three times per agent | Said once: servers start detached with `nohup`; Bash `run_in_background` only for finite work, because `claude -p` waits on it for up to an hour (#244) |
| 99 skill declarations (49 distinct names) that never existed on disk; missing protocol files; agents that don't exist; `MAIN=/path/to/agent-office` placeholders; baked-in stale facts | Removed or fixed; the worktree sync delivers to the main checkout the project map names, through a temp patch file, and stashes what it delivered so the next task sends only its own work |
| Bundled `claude-api` skill pinned new code to Opus 4.7 ("non-negotiable"); no `.source.json`, so no update check | All four Anthropic skills refreshed from upstream, each with a `.source.json` |
| `MODEL_CATALOG` labelled Opus 4.8 / Sonnet 4.6 / Haiku 4.5 / Fable 5, and called Opus "use sparingly" | Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Fable 5.2, with current descriptions; the agent editor and details dropdown both treat API-key accounts like subscription |
| `agent-architect` taught the old habits to every new agent | Its template and model/effort guidance are current, with a prompt-hygiene list |

Not changed, by decision: effort levels (house preference), the built-in response style.
