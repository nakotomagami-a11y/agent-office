# Concepts

Plain-English concepts and a glossary. Read this if you're new to Agent Office and want to understand what it does before touching any code, API, or terminal.

## What Agent Office does in one paragraph

Agent Office lets you keep a small team of AI **agents** — each one an expert in a specific area — and put them to work on your **projects**. You tell an agent what to do, it does it, and everything the agent said or ran is saved so you can review it later. If a task needs several specialists, one agent (the "orchestrator") can delegate to others. All of this runs on your own machine; nothing leaves your computer except the API calls to Anthropic.

## The five core ideas

### 1. Agent

An **agent** is a specialist — a "role" like *senior developer*, *CFO*, *QA reviewer*. Under the hood it's just a Markdown file that tells the AI who to be and what to refuse to do. You have around 30 built-in agents when you start. You can edit any of them, create your own, or archive ones you don't use.

Think of an agent as a "job description" you hand to Claude. Same underlying model, different instructions.

### 2. Project

A **project** is a directory on your computer — usually a code repository — plus some metadata Agent Office keeps about it. When you add an agent to a project, that agent works inside that directory only.

Think of a project as a "workspace" that keeps everything about one codebase together.

### 3. Instance

An **instance** is one specific copy of an agent, dedicated to one specific project. If you drop the `developer` agent onto three different projects, you get three instances — each with its own conversation history and memory.

Think of instances the way you'd think of the same consultant working for three different companies. Same person, three separate relationships.

### 4. Run

A **run** is one back-and-forth: you type a prompt, the agent executes, its output streams back. Every run is saved with timestamps, tool calls, cost, and full transcript. You can replay any run later.

Think of a run as one "task" or one message-and-reply.

### 5. Skill

A **skill** is a reusable behavior contract — a Markdown snippet that gets attached to any agent that lists it. Skills are how you say "always follow this discipline" without repeating yourself across 30 agents.

Think of a skill as a "playbook" the agent must follow.

## How they fit together

```
You  ─→  Prompt  ─→  Instance (of agent, in a project)
                          │
                          └─→ Run (streams back, saved forever)
                                    │
                                    └─→ Tool calls (bash, edit files, etc.)
```

An **agent** definition + a **project** = an **instance**. Send a prompt → a **run** happens → the **skills** listed on the agent shape how it responds. History accumulates in memory tiers you control.

## Common workflows

### "I want an agent to fix a bug in my code"

1. Open your project (create one if it doesn't exist).
2. Drag the `developer` agent onto the project's roster.
3. Click the agent to open the chat panel.
4. Paste the bug report. Send.
5. Watch the agent read files, propose a fix, and run tests.

### "I want a second opinion on a strategic decision"

1. Open the project you're deciding on (or a scratch project if none applies).
2. Drag `cs-cboardroom` onto the roster — that's the board-of-advisors orchestrator.
3. Ask your question. The boardroom convenes CEO, CFO, CTO, CPO privately, then synthesises.

### "I want to know why my cloud bill spiked last month"

1. Drag `data-analyst` onto any project.
2. Ask: *"Query the runs table and show me spending by model for the last 30 days."*
3. The analyst writes SQL, runs it, returns the numbers plus the query so you can re-run it.

### "I want to give an agent a persistent note"

Every agent has a **memory tab**. Open the agent → *Memory* → type. That text is prepended to every future run for that agent. Use it for stable facts like "the API base URL is X" or "always deploy via Y".

## Glossary

| Term | Plain-English meaning |
|---|---|
| **Agent** | An AI specialist defined by a Markdown file with a role, tools, and refuse rules. |
| **Instance** | A specific copy of an agent, tied to one project, with its own memory and history. |
| **Project** | A directory + metadata that the app treats as one workspace. |
| **Run** | One back-and-forth exchange between you and an agent. Streamed live, saved forever. |
| **Skill** | A reusable behavior contract listed in an agent's frontmatter. Same skill → same rules. |
| **Model** | The underlying Claude model. Aliases: `haiku` (fast), `sonnet` (default), `opus` (senior), `fable` (max quality, you dispatch it manually). |
| **Effort** | How much thinking budget the model gets: `low`, `medium`, `high`, `xhigh`, `max`. |
| **Room** | A grouping on the office floor — Boardroom, Engineering, QA, etc. Purely visual layout. |
| **Roster** | The list of agent instances attached to a project. |
| **Worktree** | A separate on-disk copy of the project directory that one instance uses so agents don't step on each other. |
| **Frontmatter** | The YAML block at the top of an agent's `.md` file. Defines model, tools, skills, etc. |
| **System prompt** | The instructions the AI reads before answering. Composed from the agent body, its skills, and memory tiers. |
| **Session** | Claude's conversation state. Reused when you continue an instance so context isn't rebuilt from zero. |
| **SSE** | Server-Sent Events — the wire format the live-streamed output uses. |
| **Migration modal** | The dialog that opens when a new app version ships an updated agent roster. Lets you pick which changes to accept. |
| **Memory tier** | One of three text files that get prepended to every run: global (all agents), project (this project), per-agent (this agent only). |
| **Cost pill** | The colored token-count badge next to each skill in the picker. Green = cheap, red = expensive per invocation. |
| **Pipeline** | A pre-defined chain of steps that dispatches multiple agents in sequence. |
| **Broadcast** | Send the same prompt to every agent in a project at once. |
| **Starter roster** | The agents bundled with the app on first install. |

## What Agent Office is NOT

- **Not a hosted service.** Everything runs locally. There is no cloud tier.
- **Not a Claude replacement.** It's a shell around the Claude Code CLI — it doesn't provide the AI itself.
- **Not for team collaboration** (yet). One machine, one user.
- **Not a project manager.** It doesn't track tickets, sprints, or deadlines. It runs AI on your existing code.

## The mental model in one sentence

**"I keep a small team of specialised AIs. I attach them to projects. When I ask them to do something, it happens locally, is saved forever, and I can always see exactly what they did."**
