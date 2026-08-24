# Data fetching

HTTP stack: **TanStack Query + native `fetch` + ts-pattern**. Every browser →
backend call flows through the same layers so caching, errors, and URLs are
consistent. Scattering `fetch()` calls across components is the thing to avoid —
not `fetch` itself.

```
component / hook
      │
      ▼
TanStack Query hook      src/hooks/use-<resource>.ts   (cache, invalidation)
      │
      ▼
API module               src/lib/api/<resource>.ts     (one fn per endpoint)
      │
      ▼
fetch wrapper            src/lib/api-client.ts          (base URL + errors)
```

> **Supabase projects:** replace the `fetch` wrapper with the generated Supabase
> client (`src/lib/supabase.ts`). The layers above are unchanged — API modules
> call `supabase.from(...)`, Query hooks wrap them. Skip sections 1–2 and keep 3.

## 1. fetch wrapper — `src/lib/api-client.ts`

One thin wrapper around `fetch`. It prefixes the base URL and normalizes every
non-2xx into a single `ApiError` (`status`, `message`, `fields`) so callers
branch on `err.status` instead of re-parsing bodies. No dependency — `fetch` is
the platform.

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(
      res.status,
      (typeof body.error === "string" && body.error) || res.statusText,
      body.fields as never,
    );
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
```

Components and hooks **never import `api`** directly — only API modules do.

## 2. API modules — `src/lib/api/<resource>.ts`

"Every API call in its own file." One module per resource, one exported async
function per endpoint. Plain functions, no React — trivially testable.

```ts
// src/lib/api/users.ts
import { api } from "@/lib/api-client";
import { routes } from "@/lib/routes";
import type { User, NewUser } from "@/types";

export const listUsers = () => api<User[]>(routes.users);
export const getUser = (id: string) => api<User>(routes.user(id));
export const createUser = (input: NewUser) =>
  api<User>(routes.users, { method: "POST", body: JSON.stringify(input) });
```

- URLs come from a **central routes config** (`src/lib/routes.ts`). Never
  hardcode a URL string inline.
- Type the request and response. No `any`.

## 3. TanStack Query hooks — `src/hooks/use-<resource>.ts`

Wrap the API module. The hook owns the query key, `staleTime`, and invalidation.

```ts
export function useUsers() {
  return useQuery({ queryKey: queryKeys.users.list(), queryFn: listUsers });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users.all }),
  });
}
```

See `state-management.md` for query-key structure and Zustand-vs-Query rules.

## ts-pattern

Use `match(...)` instead of `switch` / `if-else if` chains over a value — render
state, discriminated unions, status strings, event keys. `.exhaustive()` makes a
new union variant a compile error.

```ts
const label = match(user.role)
  .with("admin", () => "Administrator")
  .with("member", () => "Member")
  .with("guest", () => "Guest")
  .exhaustive();
```

## Rules

1. No ad-hoc `fetch` in components — go through an API module + Query hook.
2. One API module per resource under `src/lib/api/`, one function per endpoint.
3. URLs only from the central routes config.
4. Server state is TanStack Query, never a client store.
5. Errors are `ApiError`; branch on `err.status`.
6. `match()` over `switch`/`if-else` chains driven by a value.

## Exceptions

- **Streaming** (SSE / chunked) uses `EventSource` or `fetch` + `ReadableStream`
  in a dedicated stream hook.
- **Server Components / server actions** may call the data source directly — the
  client-side layers above only govern browser → backend calls.
