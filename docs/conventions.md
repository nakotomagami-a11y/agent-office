# Conventions

> House rules for this repo, with stable ids. **Lint messages cite these ids** —
> if you hit one, the rule below is the authority and the remediation.
>
> Rules live here because prose-only rules get violated: `arch.domain-no-app-imports`
> and `arch.parse-dont-cast` were both stated in `architecture.md`, never checked,
> and both were being broken. Seven lint messages also cited a `CLAUDE.md` that
> did not exist.
>
> **A rule with no `enforced by` line is a rule that will rot.** Prefer adding the
> check over adding the paragraph.

---

## arch.domain-no-app-imports
**`packages/domain` must never import from `@/` (app code).**

Dependencies point downward only: `route.ts` → `lib` → `packages/domain` → db/fs.
Domain logic must be callable from the scheduler, a CLI, or another route without
dragging in Next.js.

*Fix:* move the shared piece into `packages/domain`, or keep it in
`apps/web/src/lib/server/` if it genuinely needs the web runtime.

> **enforced by** `no-restricted-imports` in `packages/domain/eslint.config.mjs`

---

## arch.parse-dont-cast
**Never cast parsed external data straight to a type.**

`JSON.parse()` returns `any`. `JSON.parse(raw) as Config` is a claim the runtime
can break — the file on disk has no obligation to match. External input enters as
`unknown` and is narrowed by a schema or a type guard before use.

Applies to request bodies, on-disk JSON, and CLI stream output alike.

*Fix:* `validateBody(schema, raw)` for requests; a Zod schema or an explicit type
guard for files.

> **enforced by** `no-restricted-syntax` in `packages/domain/eslint.config.mjs`
> **known debt:** 13 pre-existing sites are baselined in `eslint-suppressions.json`.
> New ones fail. Fix opportunistically; never add to the baseline by hand.

---

## errors.machine-codes
**Errors are stable `snake_case` codes, never sentences.**

The client owns i18n. `badRequest("agent_required")`, not
`badRequest("Agent is required")`. Run failures are enumerated once in
`config/run-errors.ts`; the SSE `error` event carries `{ code, detail? }` where
`detail` is short raw context, never transcript prose.

Every code carries an **agent-facing remediation** — a failure should teach the
fix at the moment it happens, not require the rule up front.

> **enforced by** `RUN_ERROR_CODES` + `isRunErrorCode`; remediation completeness
> asserted in `run-errors.test.ts`

---

## routes.thin-controllers
**API routes are HTTP controllers, not a place for business logic.**

Four steps, in order: validate path params → validate body → call a domain
service → shape the response. When non-boilerplate logic exceeds ~1 screen,
extract a domain service — don't grow the route.

> **enforced by** `max-lines` (warn) + review

---

## naming.no-drawers
**No `utils` / `helpers` / `common` / `shared` module names.**

Use a domain name that says what the file does. Drawers accumulate unrelated code
and hide ownership.

> **enforced by** `no-restricted-imports` in `apps/web/eslint.config.mjs`

---

## ui.flexbox-only
**CSS Grid is not used in this codebase. Use Flexbox.**

*Fix:* `flex` + `flex-wrap` + `basis-*` / `w-*` / `flex-1`.

> **enforced by** `no-restricted-syntax` in `apps/web/eslint.config.mjs`

---

## code.comments-explain-why
**Comments explain WHY, never WHAT.**

A comment that restates the code is noise that rots independently of it. Write a
comment for a constraint, a gotcha, a decision, or a non-obvious interaction —
otherwise delete it and let the code speak.

Specifically: no comments restating the next line, no commented-out code, no
`// ─── divider ───` bars, and **no comments in type-declaration files** beyond
JSDoc on exported symbols.

Context: the TypeScript core sits at ~19% comment lines. Agents replicate the
patterns already in the repo, so the density is self-sustaining — which is why
this is a ratchet, not a one-off cleanup.

> **enforced by** `scripts/check-comment-ratio.mjs` (ratchet: per-file baseline,
> fails on increase)

---

## docs.citations-resolve
**Any `docs/*.md` path referenced from code must exist.**

Three dead citations shipped: `CLAUDE.md` (cited 7×), `docs/redesign-v3/REDESIGN_V3_PLAN.md`,
`docs/component-conventions.md`. A citation into a void is worse than no citation
— it sends the reader, human or agent, on a search that cannot succeed.

> **enforced by** `docs-citations.test.ts`
