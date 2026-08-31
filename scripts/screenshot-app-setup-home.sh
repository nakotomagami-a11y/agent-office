#!/usr/bin/env bash
# Rebuild the isolated showcase HOME used by screenshot-app.sh: a scratch
# `~/.claude`-equivalent with a small fixed roster of agents + minimal
# settings, pointed at a scratch code root. Idempotent — safe to re-run (e.g.
# after /tmp gets cleaned).
#
# Lives in scripts/ (tracked) rather than .showcase/ (gitignored, personal
# scratch space) because screenshot-app.sh depends on it — a workflow script
# that only runs on the machine that happened to have a gitignored file
# lying around isn't actually a workflow.
set -euo pipefail
H=/tmp/ao-showcase-home
# Must live inside $H: /api/settings/scan refuses to scan any path outside the
# server process's actual $HOME (a real safety guard, not showcase-specific),
# and the showcase server always runs with HOME="$H". A projectsRoot outside
# that — e.g. a real-looking "/home/dev/code" — makes every real folder the
# seed creates invisible to the Settings > Projects scanner: it 400s and the
# UI renders it as "nothing under that root". Doesn't affect the *displayed*
# cwd in seeded runs/tool-calls, which showcase.ts fakes as "~/code/..." for
# flavor independently of this.
CODE="$H/code"

# "Idempotent" means re-running produces the same 8 agents every time — so
# clear stale files first. mkdir -p alone only adds/overwrites; it never
# removes an agent that isn't in write_agent's list below, which would let
# leftover files silently accumulate across runs.
rm -rf "$H/.claude/agents"
mkdir -p "$H/.claude/agents" "$H/.claude/agent-office" "$CODE"

cat > "$H/.claude/agent-office-settings.json" <<JSON
{"projectsRoot":"$CODE","excluded":[],"firstRunComplete":true}
JSON

write_agent() {
  cat > "$H/.claude/agents/$1.md" <<EOF
---
name: $1
description: "$2"
default-model: $3
default-effort: high
tools: [Read, Write, Edit, Bash, Grep, Task]
permission-mode: bypassPermissions
---

# ${1}

$4
EOF
}

write_agent orchestrator       "Coordinates multi-agent work — plans, dispatches sub-agents, and synthesizes results across a team." opus   "You break large goals into a plan, dispatch specialist sub-agents, and synthesize their output into a coherent result."
write_agent developer          "Implementation-focused coding agent. Reads codebases, writes and edits files, runs builds and tests." opus     "You implement features, fix bugs, and refactor. Read existing code first and follow the conventions already in the file."
write_agent frontend-craftsman "Builds polished UI — components, animations, and empty/loading/error states — following the design system." opus "You build production-quality UI. Read the design system first and never ship broken keyboard navigation."
write_agent backend-builder    "Designs APIs, data models, and services. Owns database schema and server-side logic." opus                  "You design and implement backend services — APIs, schemas, migrations, and background jobs."
write_agent qa-codebase        "Static and dynamic QA — finds dead code, missing tests, and inconsistent error handling." sonnet          "You audit code for defects: dead code, missing coverage, unsafe error handling. Read-only unless asked to fix."
write_agent web-researcher     "Researches libraries, patterns, and prior art. Synthesizes findings into clear briefings." sonnet           "You research external sources and synthesize concise, cited briefings to inform technical decisions."
write_agent explore            "Read-only research agent — traces unfamiliar code paths and maps architecture before you build." sonnet      "You read codebases and documentation, trace flows, and produce a clear briefing. You never modify files."
write_agent business-strategist "Positioning, competitive analysis, and go-to-market strategy for the product." sonnet                    "You develop positioning, analyze competitors, and shape go-to-market strategy."

echo "isolated home ready: $H  (agents: $(ls "$H/.claude/agents" | wc -l))"
