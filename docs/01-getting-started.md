# Getting Started

Agent Office is a desktop app for running Claude Code agents on your projects. It keeps every run, its cost and its transcript, and lets you run several agents at once.

> [!TIP]
> New here? [Concepts](#/concepts) explains the parts in plain words; [Features](#/features) lists what it adds to the CLI.

## Before you start

1. **Install Claude Code and sign in once.** Agent Office runs `claude` for every agent.

   ```bash
   npm install -g @anthropic-ai/claude-code
   claude    # sign in with your Claude subscription or an API key
   ```

2. **Get Agent Office.** Windows and Linux have installers on the releases page. On macOS, build from source (see the README).

On Linux, pasting images needs `wl-clipboard`.

> [!WARNING]
> Every starter agent uses `permission-mode: bypassPermissions`: it runs any shell command and edits any file your user account can, without asking. Use them only on projects you are happy for them to change, or set `permission-mode: default` in an agent's file (`~/.claude/agents/`) and the app asks you first.

## First launch

A setup wizard opens:

1. **Essentials**: checks that `claude` is installed.
2. **Workspace**: the folder that holds your repos; each subfolder can become a project.
3. **Ignore**: folder names the scanner skips (`node_modules`, `.git`, …).
4. **Extras**: optional integrations, also in Settings later.
5. **Crew**: pick starter agents; each is copied to `~/.claude/agents/` as a markdown file you can edit.
6. **Project**: pick one or more folders to open, or skip.

Settings are saved in `~/.claude/agent-office-settings.json`. To see the wizard again, remove `firstRunComplete` from that file.

## Your first run

Open a project and click **Add agent** on the office toolbar to give it an agent. Click the agent, open its chat, type a prompt and press **Send**. The answer streams in live, and the run stays in the history with its cost and transcript.
