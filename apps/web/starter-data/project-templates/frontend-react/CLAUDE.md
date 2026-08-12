# {{PROJECT_NAME}}

Frontend project. {{FRONTEND}} + TypeScript + Tailwind + Zustand.

## What this is

One-liner: _replace this with a sentence-long description of what the app does and who uses it_.

## Stack

- **Framework**: {{FRONTEND}}
- **Language**: TypeScript, strict mode. No `any` outside `node_modules/`.
- **Styling**: Tailwind CSS v4. **Token classes only** (`text-fg`, `bg-bg-2`, `border-line`). Never inline `style={{ color: "..." }}`. Never raw color names (`text-red-500`). When the design needs a new color, add a token in `globals.css`.
- **State**: Local component state first. `useState` / `useReducer`. Lift to **Zustand** only when state is shared by two components that don't share a parent-child relationship.
- **Data fetching**: **TanStack Query + axios**. Server state lives there, not in Zustand. Every backend call goes through an API module in `src/lib/api/<resource>.ts` (axios), consumed by a Query hook. Never bare `fetch`. See `docs/data-fetching.md`.
- **Control flow**: **ts-pattern**. Use `match(...).exhaustive()` instead of `switch` / `if-else if` chains over unions, status strings, and event keys.
- **Forms**: react-hook-form + Zod resolver. Validation schemas live next to the form.
- **Testing**: Vitest + Testing Library. Test behavior, not implementation.

## House rules (non-negotiable)

1. **No inline styles.** Token classes via Tailwind. If you need a one-off value (e.g. an animation delay), use Tailwind's arbitrary value syntax `[animation-delay:240ms]`.
2. **No raw color classes.** `text-red-500` is banned. Use semantic tokens (`text-danger`, `text-warn`).
3. **One component per file.** File name matches the export. Kebab-case file, PascalCase component: `button-group.tsx` exports `ButtonGroup`.
4. **Props interface above the component.** Inline `({ a, b }: { a: string }) => ...` is fine for trivial sub-components only.
5. **No `any`.** Use `unknown` + narrowing, or define the type. If a third-party type is missing, declare it in `src/types/`.
6. **No barrel exports** outside designated public-API files. Direct imports keep tree-shaking honest.
7. **Server state goes through TanStack Query.** No raw `fetch` calls in components or hooks. Every endpoint is a function in an API module under `src/lib/api/` (axios); URLs come from a central routes config, never hardcoded inline.
8. **`match()` over `switch`/`if-else` chains.** Use ts-pattern for any branch driven by a value (discriminated union, status, key). Prefer `.exhaustive()`.
9. **Split logic from markup.** `.tsx` files are for JSX. Pure helpers (formatting, parsing, grouping, classification) go in `src/<module>/utils/`; stateful/derived logic (a `useState`+`useMemo` cluster, data wiring, mutations) goes in a `use-<name>` hook. A component should read as: call a hook, map the result, render. Never declare a module-scope `function foo()` or a fat `reduce`/`filter`/`for` block inside a component file — extract it. Reuse an existing util before writing a near-duplicate. See `docs/component-conventions.md`.
10. **No CSS Grid. Use Flexbox for all layouts.** `grid`, `grid-cols-*`, `grid-rows-*`, `grid-template-*` are banned. Every layout — page shells, card decks, forms, dashboards, everything — is built with `flex` + `flex-wrap` + gap utilities. Grid consistently produces subtle alignment and sizing bugs in this codebase; flex is the house standard. If you think you need grid, you don't — reach for `flex` with `basis-*` / `w-*` / `flex-1` instead.

## Before you change X, read Y

- Adding a new store → `docs/state-management.md`
- Calling the backend / adding an endpoint → `docs/data-fetching.md`
- Styling anything → `docs/styling.md`
- Creating a new component → `docs/component-conventions.md`
- Big architectural change → `ARCHITECTURE.md` + add an ADR to `DECISIONS.md`

## Out of scope

These are explicitly NOT this project's job. Push back if asked:

- Authentication backend (use the backend service or a third-party - this app consumes auth, doesn't implement it)
- Email sending, payment processing, file storage (backend concerns)
- SEO for content beyond what {{FRONTEND}} supports natively
- _add project-specific exclusions here_

## Memory

- This file is read on every Claude session start. Keep it current.
- Long-running gotchas, "we tried X and it broke" notes, and project conventions go in `DECISIONS.md`.
- Specific task plans go in `PLAN.md`.
