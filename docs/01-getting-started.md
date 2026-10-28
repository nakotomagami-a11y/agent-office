# Getting Started

Agent Office is a desktop app for running Claude Code agents on your projects. It keeps every run, its cost and its transcript, and lets you run several agents at once.

> [!TIP]
> New here? [Concepts](#/concepts) explains the parts in plain words; [Features](#/features) lists what it adds to the CLI.

## Before you start

1. **Install Claude Code.** Agent Office runs `claude` for every agent, whichever AI provider you choose.

   ```bash
   npm install -g @anthropic-ai/claude-code
   claude    # sign in with your Claude subscription (skip if you will use an API key or a local model)
   ```

2. **Get Agent Office.** Windows and Linux have installers on the releases page. On macOS, build from source (see the README).

On Linux, pasting images needs `wl-clipboard`.

> [!WARNING]
> Every starter agent uses `permission-mode: bypassPermissions`: it runs any shell command and edits any file your user account can, without asking. Use them only on projects you are happy for them to change, or set `permission-mode: default` in an agent's file (`~/.claude/agents/`) and the app asks you first.

## First launch

A setup wizard opens:

1. **AI**: choose where agents run, and make sure it connects. This step is required.
   - **Claude subscription** (the default): uses your `claude` login. If you are not signed in, sign in from this step.
   - **Anthropic API key**: pay per token with your own key.
   - **OpenAI**: pay per token with an OpenAI key. Agents keep their `haiku`, `sonnet` and `opus` names; you choose the OpenAI model each one runs on.
   - **Local model**: Ollama, LM Studio or any OpenAI-compatible server. Enter its address (for example `http://localhost:11434/v1`) and a model.

   Press **Test connection**, or Enter in a field. **Next** saves the provider and moves on only once it connects. If the provider cannot be reached but the setup is otherwise valid (a server that is not running yet, or no login), **Continue anyway** saves it as unavailable; agents will not start until it works. An invalid key or address is never accepted. Agent Office never switches to another provider on its own. Keys are stored encrypted on this device and are never shown again.
2. **Workspace**: the folder that holds your repos; each subfolder can become a project.
3. **Ignore**: folder names the scanner skips (`node_modules`, `.git`, …).
4. **Extras**: optional integrations, also in Settings later.
5. **Crew**: pick starter agents; each is copied to `~/.claude/agents/` as a markdown file you can edit.
6. **Project**: pick one or more folders to open, or skip.

Settings are saved in `~/.claude/agent-office-settings.json`. To see the wizard again, remove `firstRunComplete` from that file. Change the provider later in **Settings → AI provider**.

## Your first run

Open a project and click **Add agent** on the office toolbar to give it an agent. Click the agent, open its chat, type a prompt and press **Send**. The answer streams in live, and the run stays in the history with its cost and transcript.
