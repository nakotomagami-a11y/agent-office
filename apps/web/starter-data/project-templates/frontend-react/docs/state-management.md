# State management

Two state systems: **client state** (Zustand + React local state) and **server state** (TanStack Query). They are not interchangeable. Mixing them is the most common mistake.

## When to use what

| Need | Tool |
|---|---|
| Ephemeral UI - toggle, dropdown open/closed, form draft | `useState` |
| Complex local transitions | `useReducer` |
| Shared client state across non-parent-child components | Zustand store |
| Anything fetched from the backend | TanStack Query |
| Cached result of an expensive computation | `useMemo` |

If you find yourself reaching for Zustand, ask first: _can I lift this state to a common parent?_ If yes, do that. Zustand is for state that lives **outside** the React tree's natural ownership.

## Zustand store conventions

One file per store: `src/stores/use-<name>-store.ts`. The hook name matches.

```ts
import { create } from "zustand";

interface CommandPaletteState {
  open: boolean;
  query: string;
  setOpen: (open: boolean) => void;
  setQuery: (query: string) => void;
  reset: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  query: "",
  setOpen: (open) => set({ open }),
  setQuery: (query) => set({ query }),
  reset: () => set({ open: false, query: "" }),
}));
```

Rules:
- One state shape per store. Don't mash unrelated concerns together.
- Actions are part of the store. No external dispatch layer.
- Persistent stores (auth tokens, theme) use the `persist` middleware with `localStorage`. Document what's persisted in the store file.
- **Never** subscribe to the whole store from a component. Use a selector: `const open = useCommandPaletteStore((s) => s.open)`. Otherwise every state change re-renders every subscriber.

## TanStack Query conventions

> The HTTP layer (axios client + per-resource API modules) that these hooks
> call lives in `docs/data-fetching.md`. Query hooks wrap API modules — they
> don't call `fetch` or `axios` directly.

- Wrap server data hooks: `src/hooks/use-<resource>.ts` exports `useUserList()`, `useUser(id)`, `useCreateUser()`. The `queryFn` is an API-module function (`listUsers`), never an inline `fetch`.
- Query keys are arrays, structured: `["users", "list", { filter }]`.
- Centralize key builders in `src/lib/query-keys.ts` so invalidation is type-safe:

```ts
export const queryKeys = {
  users: {
    all: ["users"] as const,
    list: (filter?: UserFilter) => [...queryKeys.users.all, "list", filter] as const,
    detail: (id: string) => [...queryKeys.users.all, "detail", id] as const,
  },
};
```

- Mutations invalidate by prefix: `queryClient.invalidateQueries({ queryKey: queryKeys.users.all })`.
- Use `staleTime` deliberately. The default (0) means refetch on every mount. For boring data, `staleTime: 60_000` or longer.

## Anti-patterns

- ❌ Storing fetched data in Zustand "for convenience". TanStack Query already does caching, invalidation, retries.
- ❌ Calling `setState` inside `useEffect` that watches `props` - derive instead, or call a useEffect with the right dependency.
- ❌ A "context provider for everything" - just use Zustand.
- ❌ Subscribing to the entire store object - always select.
- ❌ Triggering refetches with `useEffect` - use TanStack Query's `enabled` flag or `refetchOnMount`.
