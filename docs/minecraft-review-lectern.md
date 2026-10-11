# Review Lectern — PR review in Minecraft

A block that shows a project's open GitHub pull requests and their diffs. Built: the backend (review, merge, reject
through `gh`) and a **read-only** lectern. Not yet: review actions at the lectern (the buttons show "comes in the next
update"), and the same screen on the tablet. The idea is AgentCraft's merge-review screen.

## Decisions (user, 2026-10-10)

| Question | Decision |
|---|---|
| What is a pull request? | A GitHub PR, through `gh`; feedback also goes into the authoring agent's chat |
| What does one lectern show? | One project's open PRs (chosen on first use), or All projects |
| Comments | Line comments + an overall comment, sent as one GitHub review and one agent message |
| Merge / Reject | Merge = squash + delete the remote branch, only with green checks, second-click confirm; Reject = close with your reason, keep the branch; the agent is told either way |
| PR → agent | Recorded when an agent's `gh pr create` prints a PR URL; else the `agent/<instanceId>-…` branch name; else picked once by hand |

## In the game

- **Block** `agentoffice:review_lectern`: the vanilla lectern, tinted lavender. Crafted from a lectern + a book and
  quill. Use opens the review screen; the first use (or a sneak-use with empty hands) picks the project.
- **Binding** is the client's: `config/agentoffice-lecterns.json`, key `world|dimension|x,y,z`, value a project id or
  `*` (All projects). Which project a lectern shows never reaches the Minecraft server; the owner's client only tells
  it which lectern an agent works at (`minecraft-mod.md`).
- **Screen** (`ReviewScreen`, `DiffView`): header (`#n title`, state, `k of N`), branch into base, checks and size, the
  linked seat; files and notes (the PR body, reviews, comments) on the left; the diff on the right (line numbers,
  hunk headers, folds, wrap). Keys: `j/k` scroll, `n/p` file, `[ ]` PR, `w` wrap, `r` refresh, Esc. All projects
  loads every project and skips ones `gh` can't read.
- Everything from GitHub is drawn through `Review.visible` (formatting and control characters shown as codes, no bidi
  reordering): a PR can't restyle or reorder what the reviewer sees.

## In Agent Office

- Domain `packages/domain/src/services/review/`: `diff.ts` (parser), `gh.ts` (runner, error codes), `pulls.ts`
  (list, detail, checks, link resolution), `actions.ts` (review, merge, reject, link), `message.ts` (what the agent
  reads). Links in the `pr_links` table; recorded by `execution/runs/pr-create.ts`.
- API `apps/server/src/routes/projects/[id]/reviews/…`: list, detail, `review`, `merge`, `reject`, `link`. Schemas in
  `packages/api-contract/src/review.ts`. Errors are `{ error: <code>, hint, detail? }`, codes and hints in
  `config/review.ts`; the lectern shows the hint.
- `gh` always runs with an args array (never a shell) in the project's directory, as the project's GitHub identity.

## Rules (several from QA)

- **Your own PR**: GitHub refuses Approve / Request changes on your own PR, and agents push as you. Then the verdict
  is posted as a comment starting with it (`**Changes requested** (from Agent Office)`); the agent gets the real
  verdict.
- **Merge** is refused for red or pending checks (none at all counts as green), a draft, conflicts or a blocked PR.
  It merges only the reviewed commit (`--match-head-commit`). After the merge nothing becomes an error: a PR still
  open means a merge queue took it. The remote branch is deleted only for a same-repo PR, never the default branch, a
  long-lived name (main, develop, release/…) or the base of another open PR. It goes through the API, not
  `--delete-branch`, which would also delete the local branch an agent's worktree may have checked out.
- **Reject** closes first, then posts the reason (a retry stops at `pr_not_open` instead of posting twice).
- **Agent links** count only inside their own project and while the seat exists; a recorded link never overwrites a
  manual one; a fork's PR is never linked by branch name.
- **Agent message**: GitHub text is fenced as data. A failed notification after a successful GitHub write is
  reported as `notified: false`, never an error.
- **Identity** (shared with agent runs, `runs/spawn-env.ts`): a project `GH_TOKEN` / `GITHUB_TOKEN` wins; else the
  project's GitHub account (`GH_CONFIG_DIR`), with any inherited token dropped; else whatever is inherited.
- **Spawn safety**: spawn `PATH`s keep absolute entries only (`infra/search-path.ts`), so a repo can't ship its own
  `gh.exe` or `claude.exe`.
- **Cross-site**: review requests a browser marks with any `Sec-Fetch-Site` but `same-origin` or `none` get a 403
  (`apps/server/src/lib/review-route.ts`).
- **Advisory, not a boundary**: an agent can call these endpoints itself (it has `gh` with the same token anyway).
  The lectern is a review tool for you, not a gate against your agents.
- **Tested** with a fake `gh` that fails the way `gh` does, and end to end with a stand-in `gh`; not yet against real
  GitHub.
