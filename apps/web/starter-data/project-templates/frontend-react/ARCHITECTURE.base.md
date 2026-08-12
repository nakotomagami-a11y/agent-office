# Architecture - {{PROJECT_NAME}}

How the frontend is organized and the rules that keep it that way.

## Stack summary

| Layer | Choice | Why |
|---|---|---|
| Framework | {{FRONTEND}} | See ADR-001 |
| Language | TypeScript (strict) | No `any`, no implicit any, exact optional property types |
| Styling | Tailwind CSS v4 + token classes | Single source of truth for design |
| State (client) | Zustand | Tiny, no provider tree, easy to reason about |
| State (server) | TanStack Query | Cache, retry, invalidation as first-class concerns |
| Forms | react-hook-form + Zod | Validation as a contract, not scattered checks |
| Routing | _(see framework-specific section below)_ | |
| Testing | Vitest + Testing Library | Fast, ESM-native |
| Package manager | pnpm | Workspace-friendly, fast, deterministic |

## Directory layout

```
src/
├── app/              # routes / pages (framework specific)
├── components/
│   ├── ui/           # primitives - button, input, card, modal
│   └── <feature>/    # feature-scoped composites
├── hooks/            # cross-cutting hooks (use-debounce, use-media-query)
├── lib/              # pure utilities, no React
├── stores/           # Zustand stores - one file per store
├── types/            # shared types not owned by a single feature
└── styles/           # globals, token definitions
```

Feature work that crosses components, hooks, and stores **goes in `src/modules/<feature>/`** with its own `components/`, `hooks/`, and `store.ts`. Pull it back into the top-level folders only if it gets reused by 3+ other features.

## Component rules

- One component per file. Default export disallowed - always named export.
- Props interface lives directly above the component.
- Children components used only by the parent live in the same file (private) or a `_internal/` sub-folder (private but reusable across the feature).
- Side effects in `useEffect` need a comment explaining why an effect (not derived state, not event handler) was the right tool.

## State rules

- **Local first.** `useState` for ephemeral UI. `useReducer` when transitions get gnarly.
- **Lift carefully.** If two siblings need state, lift to the parent. Only go to Zustand when the consumers don't share a meaningful ancestor.
- **One store per concern.** `useUserStore`, `useToastStore`, `useCommandPaletteStore`. No god-store.
- **Stores stay client-only.** Server data lives in TanStack Query. Caching, refetch, invalidation are query concerns, not store concerns.
- **No store inside a store.** If derived data is needed, compute it with a selector at the call site.

## Styling rules

- Tailwind v4. Token classes only. See `docs/styling.md` for the token taxonomy.
- Conditional classes via `clsx` (or inline arrays joined with spaces). No string concatenation.
- Dark mode via the `dark:` variant. Token definitions handle the actual color swap.
- Arbitrary values (`[w-23px]`) need a comment explaining why no token fits. If they're used twice, they need a token.

## Data fetching pattern

- **Read**: TanStack Query `useQuery` in the component or in a custom hook (`use-user-list.ts`).
- **Write**: `useMutation` with `onSuccess` calling `queryClient.invalidateQueries`. Optimistic updates only when the UX clearly benefits.
- **Query keys**: structured arrays - `["users", "list", { filter }]` not `"users-list"`. Centralize key builders in `lib/query-keys.ts`.
- **Errors**: surface to the user via a toast or inline error state. Never swallow.

## Forms

- react-hook-form. Use `zodResolver` for validation. Schema co-located with the form (`profile-form.schema.ts`).
- Field components wrap react-hook-form's `Controller` only when integrating with a custom input. Native inputs use `register()`.
- Submit handlers are async functions. Show loading state via `formState.isSubmitting`.

## Error boundaries

- One root error boundary that catches anything unhandled.
- Feature-level boundaries only when there's a specific recovery story ("retry this widget without reloading the page").

## Testing posture

- Test what the user sees and does. `render`, `screen.getByRole`, `userEvent.click`.
- Don't test implementation details (state shape, internal methods).
- Mock at the network boundary (msw, or by mocking the query hook).
- Snapshot tests are off by default. They rot. Use them only for stable structural output (e.g. a generated SQL string).

## What NOT to do

- Don't use `useEffect` to derive state from props - use `useMemo` or derive inline.
- Don't put TanStack Query state in Zustand. Pick the right tool.
- Don't add a UI library (MUI, Chakra, Ant). The token system + Tailwind is the design system.
- Don't bypass the type system with `as` casts. Narrow with type guards.
- Don't use default exports. They make refactoring brittle and IDE tooling weaker.
- Don't reach into a Zustand store's setter from outside React (e.g. in a utility). Stores are React-shaped state.
- Don't create barrel `index.ts` files for every folder. They hide imports and hurt tree-shaking.

<!-- FRAMEWORK_SPECIFIC -->
