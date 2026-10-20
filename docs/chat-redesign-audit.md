# Conversation modal redesign: audit before building

Status: **Audit done; bug fixes on this branch** (see "Fix log"). Audit written 2026-10-20 against `origin/main` @ `3ff14d4`.

This document checks two design files against the code as it is today, so the build can be planned
from facts instead of from the design's own notes. Every claim below was checked against a file and a
line. Line numbers will drift; the file names won't.

## Sources

| Design file | What it is |
|---|---|
| `Agent Inspector.html` | The agent modal **header** (tabs, name, chips, mission chip, tools popover, `+N` overflow). |
| `Chat States.html` | Every **thread** row, banner and composer state, with an 11-item developer handoff table and 5 open questions. |

Both files are bundled design artifacts (React + a gzip/base64 manifest). They are not in the repo; see
open question Q1. The handoff table tags each item `SHIPPED`, `SHIPPED + TWEAKS`, `NOW vs TARGET` or
`TARGET · PROPOSED`.

The live app was also checked: the mission seat chats of mission `f1f99d76` on the running server.

## What changes the plan

These are the findings that contradict the design's handoff notes or change the size of the work.

1. **System turns render as "YOU".** `groupTurns` makes every `you` item the turn ask whatever its
   origin (`summon/format/thread-rows.ts:64-66`), and the ask header ignores origin
   (`summon/components/chat-thread.tsx:407-426`). The `SystemNotice` branch in
   `message-bubble.tsx:525` can never run. This hits mission digests, QA-loop fix rounds and
   background-shell notices. `PersistedRun.origin` already exists, so the fix is client-only (S).
2. **Rerun on a system turn re-sends it as the user** (`chat-thread.tsx:423`). The agent sees the same
   text either way (origin is metadata, and mission rulings are recognised by their fixed format,
   `missions/protocol.ts:131,152-153`), so this is not a ruling forgery. The real effects: the rerun is
   stored as `user`; it counts in `goalOf`'s user-prompt lookup (`execution/qa-loop.ts:53`); and with
   QA loop on it can start a new loop whose goal is that system prompt (`qa-loop.ts:68,94`). Applies to
   any rerun system turn: fix rounds, digests, shell notices. Correctness bug.
3. **The long-turn work log needs a server change.** The handoff says "No server change". That holds
   only while a turn is live. A finished turn is rebuilt from the DB as all tool calls followed by
   *one* agent-text holding every text block, joined with a paragraph break only where a tool call
   intervened and with nothing otherwise (`summon/format/conversation-to-thread.ts:17-47`,
   `execution/runs/text-blocks.ts:17-24`). Block boundaries can't be recovered from the saved text,
   no offsets or times are stored, and agent-text items have no `ts` (`domain/src/types/thread.ts:12`).
   The handoff's rule would find zero updates on every reloaded turn. Fix: record `{offset, ts}` per
   text block on the run. This is additive; nothing the agent sees changes.
4. **Tool calls are pruned after 48 h** (`types/index.ts:114-120`, `db/messages.ts:115-120`). Older
   turns lose their tool rows and the work log's call counts. QA-loop findings survive: `findingsFor`
   runs once when a review finishes and the result is appended to the loop row's `history`
   (`loop-runner.ts:231`, `loop-machine.ts:58,221`). What is lost is which round each finding came from.
5. **Shell events: no exit code, no output tail.** The watcher sends one string from
   `buildWakeMessage` (`execution/background-shell-watcher.ts:34-40`). The shell is a grandchild the
   server only polls for liveness, so its exit code is not observable today and its output is captured
   nowhere. Command and duration are available. Background-shell tracking finds the PID with
   `ps --ppid` (`runs/background-shell.ts:44`), which BSD/macOS `ps` doesn't support and Windows has no
   native `ps` for. The `catch { return []; }` swallows it, so shell tracking silently finds nothing on
   Windows and macOS.
6. **Missions and loops have almost no thread UI.** Missions have a header `MissionPill` + panel only.
   Loops have a QA toggle + `LoopPill` in the inspector header only. Review rounds never reach the
   thread (`loop-runner.ts:98,138`: `conversationId: null`); fix rounds show as a raw "YOU" turn
   including `<findings>` tags; loop end goes only to a log (`loop-runner.ts:195`).
7. **The mission phase stepper has no data.** "Scan → Design → Gate → Build → QA → Done" appears
   nowhere in code; it is the coordinator's prose. `docs/missions.md:268` lists a different sequence.
   Building it is a protocol change.
8. **Chat links are probably dead in the desktop app.** Links get `target=_blank`; `lib/tauri-window.ts:76`
   says `window.open()` is a no-op under Tauri, and `mission-fields.tsx:74` works around the same thing.
   Needs a live check. One click handler calling `openExternalUrl` fixes it either way.
9. **Markdown is hand-rolled and partial.** Missing: blockquotes (literal `>`), task lists, `#`/`####`
   headings, nested lists, strikethrough, `---`, `![img](url)`. The app already ships
   `react-markdown` + `remark-gfm` (`apps/web/package.json:39-40`, used by `docs/docs-render.tsx`), and
   there's a second copy of the hand-rolled renderer in `components/ui/prose-view.tsx`. Decide this
   before adding blockquotes, autolinks and chips by hand (Q4).

## Agent context: zero overhead

Every item below is presentation or additive metadata stored next to a run. `run.prompt` and the text
the agent reads stay byte-for-byte the same. The client sends only the typed text and the
`contextProfile` (`use-conversation-chat-model.ts:225`); the thread array never reaches the server.
Editing a queued message (Q9) changes text the human wrote, which is expected.

Exceptions, each needs a yes/no:

- A mission phase stepper driven by a new `phase:` header in `ao-post` blocks changes what the
  coordinator is told (Q14).
- Putting attachment sizes into the attachments block changes the text the agent reads (Q20).

## Bugs in today's code (independent of the redesign)

| # | Bug | Where | Size |
|---|---|---|---|
| B1 | System-origin turns render as YOU with the human's avatar | `thread-rows.ts:64-66`, `chat-thread.tsx:407-426` | S |
| B2 | Rerun offered on system turns; re-sends them as the user | `chat-thread.tsx:423` | S |
| B3 | Exit line shows a green check for every exit code; exit 0 is hidden, so every exit line shown is a failure drawn green | `message-bubble.tsx:622-624`, `chat-thread.tsx:436` | S |
| B4 | The "YOU 14:02" time never renders: `fmtClockTime` expects `y_<ms>` ids nothing produces | `format/message-format.ts:11-20`, `chat-thread.tsx:400` | S |
| B5 | Sub-agent cards vanish once a turn finishes (history skips the spawn; child runs aren't attached to the turn) | `conversation-to-thread.ts:30` | M |
| B6 | Sub-agent `startTs` resets to replay time on reconnect, so durations are wrong | `format/parse-sse-event.ts:161,171` | S |
| B7 | Chat links probably do nothing in the desktop app (needs a live check) | `.ao-prose a` + `target=_blank`; `lib/tauri-window.ts:76` | S |
| B8 | Enter in the slash menu sends the raw `/c` text; only Tab picks | `hooks/use-composer-keyboard.ts:36-39,83` | S |
| B9 | Inspector header chips wrap and overlap at 1500 px (effort, playwright, QA loop wrap to 2–3 lines; name cut to "Sessi…") | `office/components/agent-details/index.tsx:345,370-452` | fixed by the header redesign |
| B10 | Mission panel questions show literal `**` (raw text in a `whitespace-pre-wrap` `<p>`) | `missions/components/mission-panel-controls.tsx:75` | S |
| B11 | Four-backtick fences render garbled: the welcome tells agents to use them when a post contains code; the triple-fence regex opens at the 2nd backtick and closes at the inner fence (stray backticks, inner code as prose, a new block opened at the inner closing fence) | `lib/markdown.ts:91`, `missions/protocol.ts:115` | S |
| B12 | Bold, italics and links are applied inside inline code (same bug in `prose-view.tsx`) | `message-format.ts:188-193` | S |
| B13 | Queued-system-notice comment "Same card as the one it becomes once it runs" is false (see B1) | `chat-thread.tsx:539-540` | — |
| B14 | `.composer-box.drag-over` never applies (`drag-over` is set, but no element has `composer-box`); `.chat-jump-latest` matches nothing | `styles/composer.css:4`, `styles/performance.css:11,122` | S |
| B15 | Inspector never shows `WorkflowPill` (sub-agent tree): it passes `noHeader` | `chat-panel-body.tsx:77-88`, `agent-details/index.tsx:576` | Q |
| B16 | A scheduled resume starts a run the conversation never adopts: the finish is dropped (`runId !== activeRunId`, and a parked conversation has `activeRunId: null`), and `runStarted` is a no-op unless running. The conversation stays `needs_attention`; the comment claiming it clears is false | `execution/scheduler.ts:50`, `conversation-machine.ts:118,125,130`, `use-conversation-chat-model.ts:273-277` | M (needs a machine transition) |
| B17 | Open folder / VS Code never works on Windows or macOS and reports success: the default branch spawns `xdg-open` (Linux only); `spawn("code")` without a shell gets ENOENT on Windows (`code.cmd`); the route returns `{ok:true}` regardless; no `'error'` handler, so the standalone `pnpm server` crashes (under Next the error is logged) | `routes/projects/[id]/open-folder/route.ts:22-27`, `office-toolbar.tsx:538,546` | S–M |

## Security notes

- **Link filter lets `//evil.example` through** (anything starting with `/` passes, `lib/markdown.ts:21-23`),
  and same-origin `/api/...` links too, including uploaded `.svg` served inline as `image/svg+xml` from
  the app origin (`api-helpers.ts:152,164`) with no CSP (`next.config.mjs:71-86` sets none;
  `tauri.conf.json` has `"csp": null`). Generated images already exclude SVG for this reason.
  Fix: allow only absolute `http(s)`/`mailto` hrefs in chat and render every relative href as plain
  text. A narrower "block `//` and `/api/`" rule is bypassable (`/evil.example` normalises to
  `//evil.example`). Also serve `.svg` uploads as `application/octet-stream` or with
  `Content-Disposition: attachment`.
- **`openExternalUrl` must only get `http(s)`/`mailto`.** Defence in depth: Tauri v2's shell `open`
  already rejects other schemes by default while `plugins.shell.open` is unset (it is unset here), but a
  file path reaching an OS opener on Windows can launch an executable, so keep the check client-side too.
- **Link previews must stay URL-only.** A server-side title fetch from a loopback server is SSRF.
- **An open-in-editor endpoint must not use a shell.** `code` is a `.cmd` on Windows and Node refuses
  to spawn `.cmd` without a shell (CVE-2024-27980 fix); `shell:true` opens command injection. Workable
  routes: resolve and spawn `Code.exe` directly, or open a `vscode://file/<path>:<line>` URI (a named
  exception to the http(s)/mailto rule). Either way, check the path is inside the worktree.

## Area by area

Status: **same** = matches design · **diff** = exists, differs · **missing** = not in code ·
**false** = the design's claim about the code is wrong. Effort: S / M / L.

### Header (`Agent Inspector.html` vs `office/components/agent-details/index.tsx`)

The code has one 84 px row; the design has two rows plus a tools popover and a `+N` overflow.

| Element | Status | Notes |
|---|---|---|
| Tabs, close, live pill, pager, + New, trash + confirm | same | Tab labels, "Session", "New", "live" are hard-coded although i18n keys exist |
| Avatar | diff | 70 px animated sprite vs 112 px framed |
| Branch line | diff | Design's `ao/frontend-1` format doesn't exist; real: `agent/<instance>-<ts>` or `<hubBranch>--<instance>`. `worktreeMissing` isn't shown |
| Kebab | diff | Code: `ProjectActionsMenu` (folder, VS Code, cache, build, dev servers). Design draws an icon only |
| Model / effort chips | same, but wrong scope | They show and edit the **agent file's** defaults (`agent-details/index.tsx:146-150`); the spawn uses `request.model ?? instance.model ?? agent.defaultModel` (`summon.ts:128-129`), so an instance or request override wins. Neither code nor design shows the override |
| "tools N on" popover | missing | Today: two separate chip toggles. API exists (`rosterPatchSchema`). Design always lists Playwright (code: only when the agent declares `mcp__playwright*`) and defaults QA loop **on** (code: off) |
| Mission chip | diff | Code shows the mission title + seat + count badge + red alarm state; design shows the word "Mission". "runtime" in the mock is a seat name, and "runtime" also names the model/effort group and a toolbar segment |
| `+2` overflow (shell + loop) | missing | Today: `BackgroundTaskPill` (with × dismiss) and `LatestLoopPill` inline. Design's "review 2/3" doesn't exist (code: "Reviewing round 2/3"). The dot has no defined meaning |
| Palette "verbatim mirror" | false | Shared tokens match, but the design's light theme lacks `--code-head-*` and `--hl-*` overrides, so light-mode code blocks would use dark colours |

### Turn structure, long turn, live tail (handoff items 1, 4, 6, 8)

| Item | Claim | Verdict |
|---|---|---|
| 1 Work log | updates = agent-text before last tool chain; no server change | **false** for finished turns (see "What changes the plan" #3) |
| 1 | update time = agent-text `ts` | **false**: no `ts` on agent-text or chunk events |
| 1 | call count = length of next tool-chain row | partial: chains also break at thinking / sub-agent / rate-limit items |
| 1 | `ExpandedStateContext`, `looksLikeQuestion`, no blockquote support | verified |
| 1 risks | trailing tool call after the answer (`git push`) folds the real summary into the log; error turns have no answer; streaming reclassifies text as each tool lands | fall back to the last update when the answer is empty or very short |
| 4 Live animation | keyframes in `live-status.tsx`; drifting 1.2 s / 1.7 s clocks; Tauri override; reduced motion | verified (keyframes live in `modal.css:77,88`). New `ao-wave-crisp` animates `box-shadow` → needs a Tauri override too. S |
| 6 Up next tray | `queuedMessages`, dismiss = `onCancelQueuedMessage` | verified |
| 6 | "Clear" | partial: route + `onClearQueue` exist, not wired to the thread |
| 6 | Edit a queued message | **no backend** (DELETE only) |
| 6 | watcher passes command / exit / duration / tail as fields | **false** (one string; no exit code, no tail) |
| 6 | shell event is "not a message" | partial: a wake notice is a real system **turn** the agent replies to |
| 8 | Load earlier, `hasNewBelow` | verified. "from 13:02" needs `ts` on the you-item (`PersistedRun.ts` is in the payload already) |
| 8 | exit line green for every code | verified, worse than stated (B3) |
| 8 | frosted pills | `backdrop-filter` was removed from Tauri modals for performance; needs the same fallback |

**Queue (your note 2).** `MessageOrigin = "user" | "system"` is on queued items and runs, so human vs
system can be split in the UI today. *Which kind* of system message (shell, mission digest, review
notify, loop) is not recorded; the UI could only sniff text. The queue is strict FIFO, nothing jumps
ahead (`conversation-machine.ts:96-114`). But a system message arriving while the chat is idle starts a
run at once, and the human's next message queues behind it. Enqueuers: HTTP route (always `user`),
background-shell watcher, review notify, mission poller (`system`), mission human rulings (`user`).
QA fix rounds use `startIfIdle`, which never queues.

**Tool-call UIs (your note 6).** Section "Tool calls and generated images" (`SHIPPED`) is today's
`tool-group-row.tsx` one-to-one. The other one, higher up in "Long turn", is the **new** work-log
proposal (item 1), not a leftover; nothing of it exists in code. The only true leftovers are two unused
keyframes in the design's style header (`ao-wave-dot`, `ao-label-sweep`).

### Mission seat chat (handoff item 9)

What a seat chat shows today: the welcome, digest and outbox notes arrive as one system message
(`missions/poller.ts:143-151`) drawn as a YOU ask in 15 px semibold, `whitespace-pre-wrap`, no markdown
(literal `>` and `**`). The seat's `ao-post` blocks render as a plain code block labelled `ao-post`,
with no posted/failed status. In the live mission one seat chat is ~94 screens tall after a few turns.

| Element | Status | Data |
|---|---|---|
| Agent Office rail/label for system turns | missing (B1) | `origin` exists. S |
| Seat-briefing card | text only | `SeatContext` has title, goal, seats, brief, PR, branch, roster (`protocol.ts:89-95`). Nothing marks which run is the welcome. No phases. `budgetUsd` is required, so "no budget limit" can't happen. M |
| One card per hub post | text only | `Delivery {commentId, envelope, text}` exists (`protocol.ts:139-145`) but is flattened to text and never stored. M |
| Hide `ao-post`; "Posted to the hub" / "Not posted" | missing | `parseOutbox`, `OutboxError` exist; per-block results are not stored; failures reach the agent as a new system turn or an in-memory note lost on restart. Hiding: S. Status: M |
| "From the hub · N posts" group, Collapse all | missing | client-only once digest data exists. S |
| Phase stepper | missing, no data | protocol change. L |
| Long-post fold, Q-/G- chips | missing | client-only regex. S |
| G- items feed needs-you | conflicts | needs-you is claims + structured asks; counting from prose breaks "provenance is data" (#165). Not recommended |

How to attach the data (recommended **B**): thread a `meta` field through queue → machine → runs, the
same way `origin` went in #165. Shape: `{kind: "mission", welcome?: SeatContext, deliveries?: Delivery[], notes?: OutboxError[]}`.
Outbox results per block go in a run-keyed record written by `postSeatOutbox`. Alternative **A**, a
side table keyed by runId, is simpler but a queued send has no runId yet.

### QA loops (handoff item 10)

| Element | Status | Data |
|---|---|---|
| Review round row | missing | No per-round record: the loop row keeps `activeRunId` + a flat `history` of every finding (round of origin lost). Per-round cost, duration and verdict aren't kept. Only the latest loop per instance is served |
| "No verdict" row | partial | detected (`loop-runner.ts:232-236`), logged only, becomes `review_failed` |
| Fix round turn | missing (raw YOU) | `fixPrompt`, `round`, `maxRounds` exist. `startIfIdle` returns the runId, so the runner can record the link **without touching the conversation model**. S–M |
| Loop end line | missing in thread | all `binding` values + `describeTermination()` exist and are browser-safe; wording differs from mock. S |
| LoopPill states | partial | Reviewing and Fixing share an icon. S |
| Loop panel | partial | Has goal, one ceiling bar, findings, Stop / Accept as-is / Allow one more (only when allowed), inline refusals. Missing segmented bar + budget + wall clock, "why it stopped" header. Not mounted in the office modal's ChatHead. S |

Proposed data: a `loop_rounds(loop_id, round, kind, run_id, findings_json, verdict, cost, duration)`
table written in `dispatch` / `onLoopRunFinished`, plus `GET /api/loops?conversationId=`. This also
records which round found each finding, plus its cost, duration and verdict.

### Agent output, links, attachments, images (handoff items 2, 7)

| Element | Status | Notes |
|---|---|---|
| Attachments footer dropped from your message | verified | `stripAttachmentFooter` hides it; `.log`/`.zip` vanish. Parse the block instead. Latent risk: the writer uses translated text and the stripper matches English only; harmless while only `en.json` exists. Don't fix it by sharing one constant across locales: that would change the text agents read in other languages |
| "Upload endpoint returns only a path" | **false** | returns `{filename, path, size}`; size is dropped at `use-composer-attachments.ts:66`. MIME is missing |
| "Dead images are hidden" | partial | only agent-text links to our own `/api/` files. Your attachments and image-job results show the browser's broken-image icon |
| Images row + files row, 3 then "+N", "Image unavailable" tile | missing | M |
| `.ao-prose a` "only coloured" | **false** | already accent + underline + 2 px offset. Rules only apply inside `.ao-modal`, not the full-page chat |
| Autolink bare URLs | missing | must skip text inside `<a>`/`<code>`. M |
| File-path chip → editor at line | missing; claim misleading | `ProjectActionsMenu` opens the **folder** (`spawn("code", [cwd])`), no file, no line, and today that route fails on Windows/macOS (B17). Needs a new endpoint (see Security notes); resolve in the agent's worktree. M |
| `#123` / sha chips | missing | the web app doesn't know the GitHub remote. Short numbers and hex will false-match. M |
| Hover preview | missing | URL-only (see Security). S |
| PR card (drawn in Long turn, not Agent output) | missing | data exists in `PullDetail` (`GET /api/projects/:id/reviews/:n`) but it pulls the whole diff |
| Image-job states (generating N/M, gap, lookup failed) | same | design examples use `imggen … -n 3`; the real flag is `-c`/`--count`, so the mock command would never show a card |
| Non-image outputs from agents | never detected | a non-image path in agent text stays plain text |

### Composer, date picker, flag cards, banners (handoff items 3, 5, 11)

| Element | Status | Notes |
|---|---|---|
| Sheen edge, focus ring | diff | S |
| Attach / slash / missions segmented | diff | `ui/segmented-control.tsx` exists. S |
| Remove model/project chips | already done | `cwdChip`/`modelChip`/`contextProfile` are passed but never drawn; delete the props |
| `SendShortcutHint` → "New messages queue…" + Stop esc | diff | button says "Abort"; Esc only closes menus today and may clash with Esc closing the dialog |
| File cards with progress | diff | uploads use axios, so real `onUploadProgress` is cheap |
| "too large · 48 MB" before upload | missing | 50 MB limit lives in `domain/services/infra/paths.ts`, which web can't import; move to `domain/config` |
| Drop overlay with blur + count | diff | Tauri's window doesn't disable its drag-drop handler, so on Windows HTML drop events may never reach the page (not run) |
| Slash menu icons, ⏎, key footer | diff | B8 |
| Date picker | diff | **The handoff text and the drawing disagree**: text says preset cards + separate hour/minute steppers + typing; drawing shows pills + one ±15 m stepper + no typing. The picker is shared with `schedules-panel.tsx`, so the "Resume…" footer and inner Schedule button must be optional |
| Item 11 tweaks (flag icon tile, banner borders, clarify border, notice sizes, code border) | all verified as described | S each |

## Decisions (product owner, 2026-10-20)

- Every bug related to the conversation modal is fixed in this mission PR, and each fix is logged below so QA knows what to test.
- Q1 (design files in the repo): **no**; they live in the cloud and change fast.
- Q2/Q4 (markdown library): **yes, in this PR**. Chat prose uses `react-markdown` + `remark-gfm`.
- Q3 (system turns as YOU, Rerun): **fix now**.
- Q7 (text-block offsets on runs for the work log): **approved**, not built yet.
- Q8 (idle system messages wake the agent): **keep waking**; revisit later.
- Q29 (date picker): the handoff text was written by the designer and is not a spec; fact-check every claim against the code.
- Q31/Q32 (defaults): **Playwright and QA loop both off by default.** The Playwright toggle affects Playwright only; no other MCP server may change because of it.
- MCP management (adding, removing and per-session toggling of every MCP server) joins this mission. Its design questions are open.

## Fix log (QA: test these)

"Auto" names the test file that covers the fix; the manual check is for a human or QA agent.

### Conversation thread

| # | Fix | Auto | Manual check |
|---|---|---|---|
| B1, B13 | System-origin turns (mission digests, QA fix rounds, shell notices) show an Agent Office tile and label, not YOU with your avatar, and render as markdown | — | Open a mission seat chat: hub digests show "AGENT OFFICE", a terminal tile, quotes as quotes (no literal `>` / `**`) |
| B2 | System turns offer Copy only, no Rerun or Delete | — | Hover a system turn: one copy button |
| — | Runs started by the app are stored with their real origin (`startSummonRun` dropped it, so every system turn was saved as the user's) | `conversation.test.ts` | Same as B1, after a reload |
| B3 | Non-zero exit line is red with ×, not a green check (inside the modal and in the full-page chat) | — | Make an agent run end with a non-zero exit: red "Exited N" |
| B4 | YOU time shows on every turn, live and reloaded | `conversation-to-thread.test.ts` | Reload a chat: each YOU header shows HH:MM |
| B5 | Sub-agent cards stay after the turn ends and after the 48 h tool-call prune; cancelled/timeout keep their status | `conversations.test.ts`, `conversation-to-thread.test.ts` | Spawn a sub-agent, let the turn end, reload: card with name, prompt, duration, status |
| B6 | Sub-agent durations and finished state survive a reconnect | `parse-sse-event.test.ts` | Reload mid-sub-agent and after: real duration, not "since reload" |
| B7 | Links open in the system browser in the desktop app | `markdown-view.test.tsx` | Desktop app: click a link in agent text, the browser opens |
| B11, B12 | Four-backtick fences render as one code block; markdown inside inline code stays literal | `markdown-view.test.tsx` | A mission post with a code block inside an `ao-post` fence renders as one block |
| — | Markdown: blockquotes, `#`–`######` headings, nested lists, task lists, strikethrough, `---`, GFM tables; bare URLs autolink | `markdown-view.test.tsx` | Ask an agent to reply with each element |
| — | Link safety: only absolute `http(s)`/`mailto` links; relative, `//host`, `/\host`, `/api/...`, `javascript:`, `data:` render as text; raw HTML never renders. `openExternalUrl` itself refuses anything else | `markdown-view.test.tsx` | — |
| B14 | Jump pill honours reduced-motion / perf-off; composer border turns dashed accent while dragging a file | — | Drag a file over the composer: dashed purple border |
| — | Streaming stays smooth on long replies: only the last markdown block re-parses per frame (~1–2 ms at any length, was ~125 ms at 20 KB); reopening a chat reuses parsed messages | `markdown-view.test.tsx` | Ask for a 20 KB+ answer with code blocks: no stutter while it streams; close and reopen the chat: opens instantly the second time |

### Composer, header, panels

| # | Fix | Auto | Manual check |
|---|---|---|---|
| B8 | Enter on the slash menu runs the highlighted command; it no longer sends `/c` or picks a hidden saved prompt. When no command matches, matching saved prompts are shown (the menu used to take the keys while invisible) | `use-composer-keyboard.test.ts` | Type `/cl`, Enter: the thread clears. Type `/` + part of a saved prompt's title: the prompts menu shows |
| — | Removed `/branch` (said "Fork", only started a blank thread, same as `/clear`) and `/prompt` (had no handler; did nothing) from the slash menu | — | Type `/`: only `/clear` |
| B9 | Header chips (model, effort, Playwright, QA loop) never wrap or overlap; the branch label truncates instead | — | Inspector at 1280–1500 px, multi-session agent on a mission seat |
| B10 | Mission panel questions render markdown | — | Open the mission pill on a seat with an open ask |
| — | Queued system notices render markdown | — | Queue a message while a mission digest is pending |
| — | Desktop drag-and-drop on Windows: Tauri's drop handler disabled (`src-tauri/src/lib.rs`) | — | **Needs a desktop build** (no Rust toolchain was available): drop a file on the composer in the Windows app |

### Server and runtime

| # | Fix | Auto | Manual check |
|---|---|---|---|
| MCP | Playwright is off unless the session turns it on; a run with no session follows what the agent declares. Excluding it uses `--disallowedTools mcp__playwright` (verified on CLI 2.1.296, sub-agents included), so local, project, plugin and claude.ai servers are untouched | `summon.test.ts` | Session with Unreal/Blender/`.mcp.json` servers: the first turn's tool list has them and no Playwright. Turn Playwright on: it appears |
| MCP | Pre-existing on `main`: any agent in default/acceptEdits/plan mode lost every non-user MCP server (strict mode). The permission bridge is now additive; strict mode is kept only for mission seats | `summon.test.ts` | An acceptEdits session keeps its local and claude.ai servers |
| B16 | A scheduled resume is adopted by its conversation: its finish clears needs-attention and drains the queue. Not adopted after "New thread", on a session mismatch, or while running; a stalled start (server died mid-start) heals after 2 min | `conversation*.test.ts`, `scheduler.test.ts` | Hit a limit, schedule a resume 1 min out, queue a message: after the run the queue drains. Schedule, then New thread: the new thread stays idle |
| B17 | Open folder / VS Code work on Windows, macOS and Linux with no shell. Failures return a code and the toolbar shows a toast (`no_cwd`, `cwd_missing`, `cwd_unreadable`, `editor_not_found`, `open_failed`). Windows refuses UNC/`\\wsl$\`, commas and quotes; macOS reveals `.app` bundles instead of launching them | `os-opener.test.ts` | Kebab → Open project folder / Open in VS Code on each OS. Rename the VS Code folder: a toast says VS Code wasn't found, and the server keeps running |
| — | Background-shell tracking works on Windows and macOS (it silently did nothing there); each background call claims at most one child; MCP servers started at CLI boot are excluded | `background-shell.test.ts`, `process-scan.test.ts` | Ask an agent to background `sleep 60`: "Shell running" pill, then "[background task finished]" |
| — | Uploaded files (SVG included) are served with a sandboxing CSP and `nosniff` | `project-uploads-route.test.ts` | Open an uploaded SVG containing `<script>` directly: no alert |

### Not fixed in this round

- **B15** (no sub-agent tree in the inspector): waits on the header design (Q36).
- Pre-existing test failures on Windows (symlink/chmod `EPERM`): 8 domain tests and `generated-images-route.test.ts`. They fail the same way on `main`.
- If the server dies mid-start, the message being started is lost: the conversation parks, but no run row holds the text.
- Jobs created from the Schedules panel carry no conversation, so they are never adopted (unchanged).

## MCP management (joined this mission 2026-10-20)

### Decisions

1. A session gets **only the MCP servers its agent declares** (`mcp__<server>__*` in the agent's `tools`), plus any you switch on.
2. **Playwright is off by default even when declared**; switch it on per session.
3. MCP gets **its own entry in the main menu** (`NAV_ITEMS` in `components/layout/main-top-bar.tsx`, next to Skills) and its own page.
4. **Hybrid source of truth** (lead's call, reasoning below): Claude Code's own config stays the single list of servers; Agent Office reads it directly and writes it only through the `claude mcp` CLI; secret values never go into it.
5. **Secrets are in scope now**: server keys live in the existing Secrets module (encrypted, linked per project, injected into the run's env).

Why the hybrid for 4: an app-owned list would mean two lists that drift. The terminal `claude` wouldn't see the app's servers, and `claude mcp login` OAuth tokens are keyed by the CLI's server names. Writing `~/.claude.json` ourselves would put us in charge of a format Claude Code owns. And with keys stored now (5), the CLI path keeps them out of that file.

### How MCP works today (checked on this machine, CLI 2.1.296)

- **Scopes:** user (`~/.claude.json` → `mcpServers`), local (`~/.claude.json` → `projects[<folder>].mcpServers`), project (`.mcp.json`, needs approval), plugins, claude.ai connectors (account-level).
- **Here:** user and local scope are empty, `agent-office` has no `.mcp.json`, `luma` has `lumagit`. The account has 10 claude.ai connectors, but in a `claude -p` run (how agents run) only 2 appear: Claude Docs (often still "pending" when the run starts, so 0 tools) and Google Drive (needs login).
- **Declared but not configured:** `developer` declares `mcp__playwright__*`; `level-designer` declares `mcp__unreal-mcp__*` and `mcp__blender__*`. No such server is configured anywhere found, so those tools don't exist for those agents today.
- **Per-run control:** `--disallowedTools mcp__<server>` removes one server's tools for the agent and its sub-agents (verified); claude.ai names normalise (`claude.ai Gmail` → `mcp__claude_ai_Gmail`). `--strict-mcp-config` drops everything not passed and is kept for mission seats only.

### Measured cost (2026-10-20, haiku, `claude -p`, input tokens per run)

| Setup | MCP tools listed | Input tokens |
|---|---|---|
| Plain run, as agents run today | 0 | 30,954 |
| + a 25-tool server with long descriptions | 33 (25 + Claude Docs' 8) | 33,158 |
| same, 25-tool server denied | 8 | 32,858 |
| same, both denied | 0 | 31,911 |

**Superseded:** these runs had no `--agent`. With an agent tool list (how agents really run) a 25-tool server costs ~7,800 tokens per run, or ~900 with `ToolSearch` in the list. See `docs/agent-capabilities-audit.md` C18.

### Design

| Part | What it does | Built on |
|---|---|---|
| **MCP page** (main menu) | Every server grouped by scope: User · Project (per project) · Local · Plugins · claude.ai. Each row shows transport, status (connected / needs login / pending approval / failed), tool count, **tokens it adds per run**, which agents declare it, linked secrets | Config files read directly; status from `claude mcp list` on demand (slow, it health-checks every server; cached, refresh button); token cost from `measureMcpTokens` (`agents/context-cost-measure.ts`) |
| **Missing servers** | "Declared by level-designer but not configured: unreal-mcp, blender" with an Add button | `agentMcpServerNames` over every agent definition |
| **Add / edit / remove** | Form: name, scope, stdio (command, args, env) or HTTP (URL, headers). Any env or header value can be "from a secret" | `claude mcp add-json <name> <json> -s <scope>` / `claude mcp remove <name> -s <scope>`, run in the project folder for local/project scope |
| **Log in** | For HTTP servers and claude.ai connectors that need auth | `claude mcp login <name>` (verify it works without a TTY) |
| **Per-session toggles** | The header's "tools N on" popover lists every server available to the session with a switch; defaults follow decisions 1 and 2 | New instance field `mcpOverrides: Record<string, boolean>` replacing `playwrightEnabled` (migrate `true` → `{ playwright: true }`); spawn denies every known server not on, via the existing `disabledMcpArgs` |
| **Context & Cost tab** | Per-server cost rows link to the toggle | Existing tab |
| **Mission seats** | Keep strict isolation; get only the user-scope servers their agent declares | Existing strict path |

**Secrets flow.** The value is stored encrypted in Secrets and linked to the project. The server config written through the CLI holds only a reference, `${NAME}`. At spawn Agent Office injects `NAME` into the run's env (existing mechanism), and Claude Code expands it. Outside Agent Office, the terminal needs `NAME` exported; the page says so on that row.

### Must verify before building

- [ ] Claude Code expands `${VAR}` in **user/local-scope** configs and in **HTTP headers**, not only in `.mcp.json`. If not: pass that one server at spawn through `--mcp-config` as a temp file (mode 0600, deleted after; never in argv, which other processes can read), non-strict so nothing else is dropped.
- [ ] `claude mcp login` and `add-json` work with stdin closed from a spawned process (Agent Office runs the CLI headless).
- [ ] The list of claude.ai connector names is only available from `claude mcp list`. Denying "everything not on" uses the cached list, so a connector added since the last refresh loads until the next one (fails open). Decide whether to refresh before each spawn (slow) or accept it.
- [ ] On Windows `claude` is a `.cmd`: spawn it the way runs already do, never with `shell: true`.

### Risks

- Adding a stdio server means running a command on every run: confirm on add, show the full command.
- Project scope writes `.mcp.json` into the repo, which usually gets committed: warn, and never put a secret value there.
- A connector or agent that should use Gmail etc. must now declare `mcp__claude_ai_Gmail__*` (or be switched on per session).

### Open questions

- M1. Menu label and position: **"MCP", after Skills** (agreed).
- M2. Dropped: connectors barely load in agent runs and cost little (see Measured cost).
- M3. **Scope cut proposed** after measuring: keep the MCP page (list, declared-but-missing, add/remove via CLI, secrets); drop per-session toggles, per-server token cost and connector handling; keep the existing Playwright toggle. Awaiting the product owner.

## Proposed build order

Each phase is shippable on its own. Phases 0–1 change no stored data.

| Phase | Scope | Server change |
|---|---|---|
| 0 Bugs | B1–B4, B7, B8, B10–B12, B17, link filter + SVG serving hardening | B17 and SVG serving only (route fixes, no schema) |
| 1 Client redesign | Header (two rows, tools popover, `+N`) · item 11 tweaks · one live animation · load earlier / jump pill / exit line · composer · date picker · attachments groups (with sizes from upload) · link styling + external open + autolink · Up next tray split by origin (no edit) · `LoopPill`/panel polish · hide `ao-post` blocks | none |
| 2 Additive data | text-block `{offset, ts}` on runs → work log on finished turns · you-item `ts` · `loop_rounds` + loops by conversation → review rows, fix-round turn, end line · mission run `meta` → briefing card, hub post cards, outbox status · `notice.kind` on queue/runs → shell event row · queue PATCH (edit) · sub-agent runs attached to turns (B5) · scheduled resume adopted by the conversation (B16) · shell tracking on Windows/macOS | migrations + additive fields; agent context unchanged |
| 3 Needs decisions | mission phase stepper (protocol) · shell exit code + output tail · file-path chips (editor endpoint) · `#123`/sha chips (remote lookup) · PR card from GitHub · markdown library switch (could move to Phase 0) | varies |

## Open questions

Each has a recommended answer in **bold**.

**Process**

- Q1. Commit the two design HTML files (≈870 KB) under `docs/design/` so later sessions can read them? **Yes; Downloads is not durable.**
- Q2. One PR per phase, or one per handoff item? **One per phase; Phase 2 split by area (turns / loops / missions).**

**Rendering**

- Q3. Fix B1/B2 (system turns as YOU, Rerun) now, ahead of the redesign? **Yes, Phase 0.**
- Q4. Switch chat prose to `react-markdown` + `remark-gfm` instead of extending the hand-rolled parser? **Yes, but as its own PR with a perf check on long threads.**
- Q5. System turns: which actions? **Copy only. No Rerun, no Delete.**
- Q6. Work-log open/closed: session memory or localStorage? **Session memory (today's `ExpandedStateContext`).**

**Long turn and queue (your notes 2 and 3)**

- Q7. Approve the additive server change (text-block offsets + times on runs) so finished turns get a work log? **Yes; without it the log exists only while live.**
- Q8. A system message that arrives while the chat is idle: wake the agent at once (today) or wait in "Up next" for you? **Keep waking at once (today's behaviour). Once the tray labels each item by kind, check whether it still feels like the agent is cutting in; add a per-kind "wait for me" setting only if it does.**
- Q9. Editing a queued message: add a queue PATCH route (keeps position) or drop Edit? **Add PATCH.**
- Q10. Shell event exit code: wrap the agent's command / read CLI internals, or ship "finished" + duration only? **Ship without exit code and tail first.**
- Q11. Background-shell tracking silently does nothing on Windows and macOS (`ps --ppid`). Fix it before building shell events? **Yes; otherwise the shell-event row never appears on this machine.**
- Q12. QA verdict card in the long turn: parse prose or rely on a structured event? **Structured only: `ReportFindings` if the sub-agent called it, otherwise no card.**

**Missions and loops (your note 4)**

- Q13. Which phase list is right: the design's Scan→Design→Gate→Build→QA→Done or `docs/missions.md`'s? **Neither is in code; defer the stepper to Phase 3.**
- Q14. If phases come, where: a manifest field (changes `manifestHash`, cross-device compatibility) or a `phase:` field on posts (changes the coordinator's prompt)? **Field on posts.**
- Q15. Briefing card: snapshot at seating time (needs meta) or live `MissionView` (GitHub call, can drift)? **Snapshot.**
- Q16. G- ids: display-only chips, or count toward needs-you? **Display only.**
- Q17. Review rounds: in the thread (reviewer runs belong to no chat) or only in the loop panel? **In the thread, as the design shows.**
- Q18. Keep findings per round (today only a flat list survives) so review rows can show which round found what? **Yes, in `loop_rounds`.**
- Q19. Mount `LoopPill` + QA toggle in the office modal's ChatHead too? **Yes.**

**Output, links, attachments (your notes 5 and 7)**

- Q20. Attachment sizes for sent messages: look up via the upload-folder listing, or put sizes in the text the agent reads? **Lookup; keep the agent text unchanged.**
- Q21. Upload progress: real (axios) or indeterminate bar? **Real; it's cheap.**
- Q22. PR card: from the URL alone or fetched via `gh`? **URL first; fetch later behind a lighter endpoint.**
- Q23. `#123` / sha chips: add a per-project `git remote get-url` lookup? **Yes; plain text when not GitHub.**
- Q24. File-path chips: open the agent's worktree copy or the main project's? VS Code only or a chosen editor? **Worktree copy, VS Code only for now (spawn `Code.exe` directly or use a `vscode://file` URI; never a shell).**
- Q25. Links: allow only absolute `http(s)` and `mailto`, and render every relative href (including `//host`, `/host`, `/api/...`) as plain text? **Yes.**
- Q26. Image-job tiles: fold to 3 like attachments? **No; never hide a slot that is still generating.**

**Composer and picker**

- Q27. Esc in the composer stops a running agent? **Only when the composer is focused and no menu is open.**
- Q28. Enter in the slash menu picks the highlighted command? **Yes (B8).**
- Q29. Date picker: follow the handoff text or the drawing? **The drawing, plus typing.**
- Q30. Desktop drag-and-drop: confirm it works on Windows before building the new overlay? **Yes, check first.**

**Header**

- Q31. Tools popover: list Playwright only when the agent declares it (code) or always (design)? **Only when declared.**
- Q32. QA loop default on (design) or off (code)? **Off.**
- Q33. Mission chip: title (code) or "Mission" (design)? Keep the red alarm state? **Title + seat; keep alarm.**
- Q34. `+N` dot meaning, and do loop actions (Stop / Accept / Allow one more) live in the overflow menu? **Dot = needs you; actions stay in the loop panel opened from the overflow row.**
- Q35. Model/effort chips: show the per-session override when one exists? **Yes, and say "agent default" vs "this session".**
- Q36. Show `WorkflowPill` (sub-agent tree) in the inspector? **Yes, in the `+N` overflow.**
