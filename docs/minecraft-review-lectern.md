# Review Lectern — PR review in Minecraft

Status: **phase 1 (backend) and phase 2 (read-only lectern, mod 0.5.0) built 2026-10-10**; phases 3–4 not started. Idea from AgentCraft's merge-review screen
(`docs/img/readme/diff.jpg` in blendi-remade/agentcraft). That repo is MIT (LICENSE added 2026-10-03): files copied from it must keep its notice (see `assets/agentoffice/textures/entity/agent/LICENSE-agentcraft.txt` in the mod).

## Decisions (user, 2026-10-10)

| # | Question | Decision |
|---|---|---|
| 1 | What is a "pull request"? | **GitHub PRs via `gh`**, and feedback is also routed into the authoring agent's chat |
| 2 | What does one lectern show? | **One project's open PRs** (chosen at placement), with an **All projects** choice |
| 3 | Comments | **Line comments + an overall comment, batched as one pending review**: one GitHub review, one agent message |
| 4 | Merge / Reject | Merge = **squash** (PR title) + delete the remote branch, second-click confirm, **disabled unless checks are green**; Reject = close the PR with your reason, keep the branch; the agent is told either way |
| 5 | PR → agent | **Recorded when an agent's `gh pr create` returns a PR URL**; else the `agent/<instanceId>-…` branch name; else ask once with a seat picker and remember |

Later: the same review screen on the tablet.

## Screen (Minecraft, vanilla + own UI kit in `client/ui/`)

- Header: `Merge review  #<n>  <title>` · state (`Waiting for you`, `Changes requested`, …) · `k of N` in the queue.
- Who/what: the agent's seat name (or the GitHub author), `<head>` into `<base>`, age; checks summary
  (`tests pass` / `2 failing` / `running`), `+A −D`, file count.
- Left: **Files** (status letter, path, +/−) and **Notes**: the PR body as the agent's summary, then existing reviews.
- Right: unified diff of the selected file: hunk headers, old/new line numbers, +/− tinting, wrap toggle,
  "N unchanged lines" folds. Click a line (shift-click a range) to add a comment; commented lines show a marker.
- Footer: `Merge` · `Request changes` · `Comment` · `Approve` · `Reject`; keys `j/k` scroll, `n/p` file, `w` wrap,
  `[`/`]` previous/next PR, `Esc` close. Pending comments survive closing the screen until submitted.

## App side

**Domain** `packages/domain/src/services/review/` — everything through `gh` (`execFile`, args array, never a shell),
run in the project's cwd with the project's `GH_CONFIG_DIR` (`resolveSpawnEnv`):
- list: `gh pr list --state open --json number,title,author,headRefName,baseRefName,updatedAt,additions,deletions,changedFiles,isDraft,reviewDecision`
- detail: `gh pr view <n> --json body,reviews,comments,statusCheckRollup,mergeable,url,headRefOid`
- diff: `gh pr diff <n>` → parsed into files → hunks → lines (pure parser, unit-tested; binary/rename/large-file cases)
- review: `gh api repos/{owner}/{repo}/pulls/{n}/reviews` with `event` (`REQUEST_CHANGES`/`COMMENT`/`APPROVE`),
  `body`, `comments[{path, line, side, start_line?}]`, `commit_id` = the head sha the diff was read at
  (a stale sha → `review_stale`, re-read)
- merge: `gh pr merge <n> --squash`, then delete the remote branch with `gh api -X DELETE …/git/refs/heads/<head>`
  (not `--delete-branch`: it also deletes the local branch, which an agent's worktree may have checked out).
  Refused unless every reported check is green (`checks_not_green`; a PR with no checks counts as green).
- reject: `gh pr close <n>`, then the reason as a comment (see "As-built rules")
- Errors are machine codes (`gh_missing`, `gh_unauthenticated`, `not_github_repo`, `review_stale`, …).

**PR ↔ agent links**: a new `pr_links` table (repo, number, projectId, agentId, instanceId,
source = `recorded|branch|manual`). `recorded` is written by the run pipeline when a Bash `tool_result` for a
command containing `gh pr create` holds `https://github.com/<o>/<r>/pull/<n>`.

**Agent notification**: `sendMessage(..., origin: "system")` into the linked conversation (the background-shell
wake path), one message per submitted review: verdict, overall comment, then each line comment as
`path:line` + the quoted lines + the comment. Merge/reject send a short closing note.

**API** (`apps/server/src/routes/projects/[id]/reviews/…`, schemas + `API_ROUTES` in `packages/api-contract`):
list, detail+diff, submit review, merge, reject, set link. "All projects" = the client fans out per project.

## Mod side

- **Review Lectern** block: a lectern model with its own retextured planks/top; crafted from a lectern +
  a writable book. Registered like the tablet (works in singleplayer/LAN; a dedicated server needs a server
  dist first). Right-click → the review screen; the first use asks for the project (or All projects).
- Project binding stored client-side per world + dimension + block position, like bodies
  (`config/agentoffice-lecterns.json`): nothing about it reaches the Minecraft server.
- Core (no Minecraft imports, JUnit-tested): diff model, pending-review state, review client calls.
  Client: `ReviewScreen` on the existing `TabletScreen`/`TranscriptView` patterns.
- Dev-run scripts stay read-only: the client refuses review submit/merge/reject there.

## Phases

1. **Backend**: review service + diff parser + `pr_links` + recording hook + API + contract + tests (fixture diffs,
   stubbed `gh`). Verifiable without Minecraft.
2. **Lectern, read-only**: block, placement/binding, queue, files, diff view, notes, keys.
3. **Review actions**: line comments, pending review, submit, merge/reject confirmations, agent picker fallback.
4. **Tablet**: the same screen from the tablet.

## Built — phase 1 (backend, 2026-10-10)

- Domain `services/review/`: `diff.ts` (parser, C-quoted paths), `gh.ts` (runner, error codes, identity env),
  `pulls.ts` (list, detail, checks, notes, link resolution), `actions.ts` (submit, merge, reject, link), `message.ts`
  (what the agent reads). Config `config/review.ts` (codes + remediation), types `types/review.ts`, table `pr_links`
  (migration v25), recording hook `execution/runs/pr-create.ts` (wired in `runs.ts` at tool_use / tool_result).
- API (`apps/server/src/routes/projects/[id]/reviews/…`): `GET` list (`{ pulls, truncated }`) · `GET <n>` detail ·
  `POST <n>/review` · `POST <n>/merge` · `POST <n>/reject` · `PUT <n>/link`. Bodies capped at 4 MB, schemas in
  `packages/api-contract/src/review.ts`, paths `API_ROUTES.projectReview*`. Errors: `{ error: <ReviewErrorCode>, detail? }`.

### As-built rules (several came out of QA)

- **Your own PR**: agents push with your account, and GitHub refuses Approve / Request changes on your own PR. When
  your login (`gh api user`) is the PR author, the verdict is posted as a COMMENT starting
  `**Changes requested** (from Agent Office)`; GitHub's 422 (its reason is in the stdout body, not stderr) is the
  fallback. The agent's message carries the real verdict either way.
- **Merge**: refused for red or pending checks, a draft, `DIRTY` (`pr_conflicting`) or `BLOCKED` (`pr_blocked`).
  Runs `--match-head-commit <reviewed sha>` and `--subject=<title> (#n)`. After that nothing may become an error:
  the PR is re-read up to 3 times a second apart (a read can lag a direct merge); still OPEN means a merge queue took
  it (`queued: true`, branch kept, agent not told yet); an unreadable state is `mergeConfirmed: false`. The remote
  branch is deleted only for a same-repo PR, never the repo's default branch (asked from GitHub) or a long-lived
  name (main, develop, release/…, gh-pages), and never the base of another open PR.
- **Reject**: closes first (a retry then stops at `pr_not_open` instead of posting twice), then posts the reason and
  line comments: a review, or a plain comment only when GitHub refused the review (a timeout may have posted it, so
  it is not re-posted then: `feedbackPosted: false`). The reason never travels in argv.
- **Agent link**: a stored link counts only inside its own project and while its seat is on the roster; a recorded
  link never overwrites a manual pick; a fork's PR is never linked by branch name. Recording needs `gh pr create` as
  a command of its own and takes the first URL alone on its line.
- **Agent message**: everything from GitHub is fenced as data (title as one escaped string, code in a fence longer
  than any backtick run inside it, a branch name that is not a plain git ref withheld). A failed notification after a
  successful GitHub write is logged and reported as `notified: false`, never an error.
- **Identity** (one rule for the lectern and for agent runs, `runs/spawn-env.ts`): a project secret `GH_TOKEN` /
  `GITHUB_TOKEN` wins; else the project's GitHub account (`GH_CONFIG_DIR`), with any inherited token dropped — gh
  ranks a token above `GH_CONFIG_DIR`, so an inherited one used to make agents push as someone else; else whatever
  is inherited. `GH_REPO`, `GH_HOST` and `GH_DEBUG` are dropped for the lectern (case-insensitively: Windows). A
  removed account is `github_account_missing`.
- **Spawn safety**: every spawn PATH keeps absolute entries only (`infra/search-path.ts`). A relative entry (this PC
  had `%USERPROFILE%\AppData\Local\Microsoft\WindowsApps` unexpanded) resolved against the child's cwd, i.e. inside
  the repo, so a repo could ship its own `gh.exe` or `claude.exe`. Fixed for agent runs too. stdin errors are
  handled (a large review crashed the server when gh exited early), and output is decoded as UTF-8 and capped.
- **Cross-site**: review GETs run gh, so a request a browser marks `Sec-Fetch-Site: cross-site` is refused.
- **Advisory, not a boundary**: an agent can call these endpoints itself (it gets `AO_BASE_URL`, and it already has
  gh with the same token). The lectern is a review tool for you, not a gate against your agents.

Verified: unit tests with a fake gh that fails the way gh does (domain: pulls 8, actions 12, diff 6, pr-create 3,
search-path 4, env-keys 1; contract 5); the PATH hijack reproduced and closed; the stdin crash reproduced (200 KB, 2 MB) and
closed; end to end through the standalone server with a stand-in `gh.exe`. **Not yet run against real GitHub**: gh
is not installed on this PC.

## Built — phase 2 (read-only lectern, mod 0.5.0, 2026-10-10)

- **Block** `agentoffice:review_lectern` ("Review Lectern", `ReviewLecternBlock`): lectern shape and properties, the
  vanilla lectern model copied with a tint slot on every face and shaded lavender (`ClientSetup.LECTERN_TINT`) — no
  new textures. Crafted shapeless from a lectern + a book and quill; drops itself; axe. Creative tab: Functional
  Blocks. No block entity: use opens a screen through `ReviewLecternBlock.openOnClient`; sneak-use picks the project
  again.
- **Binding** `core/LecternStore` → `config/agentoffice-lecterns.json`, key `world|dimension|x,y,z`, value a project
  or `*` (All projects). First use opens `LecternSetupScreen` (All projects + every project).
- **ReviewScreen**: header (`#n title`, state, `k of N`), who → branch into base, checks + size, the linked seat;
  left FILES (status letter, +/−) and NOTES (PR body as the author's summary, reviews/comments); right the diff
  (line numbers, hunk headers, `N unchanged lines` folds, +/− tint, wrap). Keys: `j/k` ↑↓ PgUp/PgDn Home/End scroll,
  `n/p` file, `[ ]` PR, `w` wrap, `r` refresh, Esc. Footer: ◀ ▶, Refresh, Copy link; Merge / Request changes / Reject
  shown disabled ("comes in the next update"). All projects loads every project in parallel and skips ones gh can't
  read (not GitHub repos). Errors show the server's `hint`; an Agent Office without the review API (404 with no code)
  says so.
- **Dev checks** (`DevHooks`): `-PaoOpen=review:<projectId|*>`, `lectern` (placed + used → picker), `lecternview`
  (placed, looked at); `-PaoPress=U+25B6` presses a button by code point (Windows mangles ▶ on the command line).
- QA fixes (2 rounds): all GitHub text drawn through `Review.visible` (§ → ¤, format/control chars and U+2028/2029 →
  ⟦U+XXXX⟧) and in logical order (`DiffView.logical`: no bidi pass, so an RTL-first line is not reversed),
  Project… button, gh_failed detail shown, timeouts 75 s list / 135 s detail, PR stepping debounced, refresh keeps
  the PR, layout-aware letter keys, footer adapts to narrow widths; diff panel in `client/ui/DiffView.java`.
- Verified: `./gradlew test build` (76 tests, incl. ReviewTest, LecternStoreTest); dev-client screenshots against a
  sandbox `pnpm server` + stand-in gh (PR queue, both PRs, All projects, picker from the placed block, a hostile PR
  with § and U+202E lines, block in the
  world, gh-missing error).
