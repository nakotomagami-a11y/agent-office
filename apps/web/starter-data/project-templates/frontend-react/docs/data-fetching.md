# Data fetching

HTTP stack: **TanStack Query + axios + ts-pattern**. Every browser → backend
call flows through the same layers. A bare `fetch()` in a component is a bug.

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
axios client             src/lib/api-client.ts          (instance + errors)
```

## 1. axios client — `src/lib/api-client.ts`

One shared axios instance. A response interceptor normalizes every non-2xx into
a single `ApiError` type (`status`, `message`, `fields`, `data`) so callers
branch on `err.status` instead of re-parsing bodies.

```ts
import axios, { type AxiosError } from "axios";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string[]>,
    public data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const apiClient = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const res = error.response;
    if (!res) throw new ApiError(0, error.message || "Network error");
    const body = res.data as Record<string, unknown> | undefined;
    const message =
      (typeof body?.error === "string" && body.error) || res.statusText || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body?.fields as never, body);
  },
);
```

Components and hooks **never import `apiClient`** — only API modules do.

## 2. API modules — `src/lib/api/<resource>.ts`

"Every API call in its own file." One module per resource, one exported async
function per endpoint. Plain functions, no React — trivially testable.

```ts
// src/lib/api/users.ts
import { apiClient } from "@/lib/api-client";
import { routes } from "@/lib/routes";
import type { User, NewUser } from "@/types";

export async function listUsers(): Promise<User[]> {
  return (await apiClient.get<User[]>(routes.users)).data;
}

export async function getUser(id: string): Promise<User> {
  return (await apiClient.get<User>(routes.user(id))).data;
}

export async function createUser(input: NewUser): Promise<User> {
  return (await apiClient.post<User>(routes.users, input)).data;
}
```

- URLs come from a **central routes config** (`src/lib/routes.ts`). Never
  hardcode a URL string inline.
- Query params go through axios `params: { ... }` — never hand-build query
  strings with `encodeURIComponent`.
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

1. No bare `fetch` in components or hooks — go through an API module.
2. One API module per resource under `src/lib/api/`, one function per endpoint.
3. URLs only from the central routes config.
4. Server state is TanStack Query, never a client store.
5. Errors are `ApiError`; branch on `err.status`.
6. `match()` over `switch`/`if-else` chains driven by a value.

## Exceptions

- **Streaming** (SSE / chunked) uses `EventSource` or `fetch` + `ReadableStream`,
  not axios. Keep it in a dedicated stream hook.
- **One-shot imperative effects** (migrations, telemetry pings) may call an API
  module directly from an effect instead of a `useMutation` — still no bare
  `fetch`.
