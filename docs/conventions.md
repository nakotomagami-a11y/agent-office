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
**`packages/domain` must never import app code: not `@/`, not `@agent-office/server`,
`api-contract` or `web`.**

Dependencies point downward only: `route.ts` → `lib` → `packages/domain` → db/fs.
Domain logic must be callable from the scheduler, a CLI, or another route without
dragging in HTTP.

*Fix:* move the shared piece into `packages/domain`, or into `apps/server/src/lib/`
if it is HTTP plumbing.

> **enforced by** `no-restricted-imports` in `packages/domain/eslint.config.mjs`

---

## arch.server-no-ui
**`apps/server` must not import UI or Next.js code (`next`, `react`, `@/`).**

The same route handler runs inside Next (the desktop app) and in `main.ts` (the
standalone server). A `NextResponse` or `next/headers` import works in the first and
crashes the second. Handlers take a web `Request` and return a web `Response`.

*Fix:* `Response.json(...)` for `NextResponse.json(...)`; `new Response(...)` for
`new NextResponse(...)`; read headers and cookies off the `Request`.

> **enforced by** `no-restricted-imports` in `apps/server/eslint.config.mjs`

---

## arch.web-through-server
**`apps/web` reaches the brains over HTTP. It never value-imports
`@agent-office/domain/services`, and imports `@agent-office/server` only in the
embedding seam.**

The UI is one client of the API; the Minecraft mod is another. A UI that calls a
domain service in-process has a feature no other client can reach, and breaks the
day the UI runs out of process. Domain *types* and *config* are fine.

The seam (`docs/architecture.md`, "The embedding seam") is five files:
`app/api/[...path]/route.ts`, `instrumentation-node.ts`, `proxy.ts`, `app/layout.tsx`
and `app/(app)/agents/[id]/edit/page.tsx`.

*Fix:* add or reuse an endpoint and call it via `API_ROUTES` from
`@agent-office/api-contract`. A pure domain function the browser genuinely needs goes on
the browser-safe allowlist, which is checked from both sides: web may import it, and the
module itself may value-import only the other allowlisted modules (`loop-machine`,
`runs/errors`, `runs/reset-time` today). No `eslint-disable`.

> **enforced by** `@typescript-eslint/no-restricted-imports` in `apps/web/eslint.config.mjs`
> and, for the allowlist, in `packages/domain/eslint.config.mjs`

---

## arch.contract-pure
**`packages/api-contract` imports only zod and `@agent-office/domain` config/types.**

Every client imports the contract, the browser bundle included, and the Java mod
mirrors it. No `node:` modules, no domain services, no app code.

> **enforced by** `no-restricted-imports` in `packages/api-contract/eslint.config.mjs`

---

## arch.parse-dont-cast
**Never cast parsed external data straight to a type.**

`JSON.parse()` returns `any`. `JSON.parse(raw) as Config` is a claim the runtime
can break — the file on disk has no obligation to match. External input enters as
`unknown` and is narrowed by a schema or a type guard before use.

Applies to request bodies, on-disk JSON, and CLI stream output alike.

*Fix:* `validateBody(schema, raw)` for requests; a Zod schema or an explicit type
guard for files.

> **enforced by** `no-restricted-syntax` (`error`) in BOTH
> `packages/domain/eslint.config.mjs` and `apps/web/eslint.config.mjs`
> **known debt:** 12 pre-existing sites are baselined in
> `packages/domain/eslint-suppressions.json`. `apps/web` has none — its 12
> accumulated while the rule was a `warn` there with an empty suppressions file
> and CI running `--max-warnings=-1`; they were fixed rather than baselined.
> New ones fail in both packages. Never add to the baseline by hand.
>
> Parse to `unknown`, then narrow: a real shape gets a schema in
> `packages/api-contract/src/schemas.ts` (a schema also supplies defaults);
> a single field read gets a guard from `packages/api-contract/src/json-narrow.ts`.

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
