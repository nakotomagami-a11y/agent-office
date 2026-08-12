# Architecture - {{PROJECT_NAME}} backend

How the Node backend is organized and the rules that keep it that way.

## Stack summary

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 24+ | Latest LTS |
| Framework | Hono | Light, edge-ready, TS-native, no decorators |
| Validation | Zod | Single source of truth for shapes |
| ORM | Drizzle | Type-safe SQL, no codegen step, native libSQL support |
| Database | libSQL via `@libsql/client` | SQLite ergonomics, Turso Cloud for prod |
| Auth | `jose` (JWT) | Industry-standard, no library lock-in |
| Logging | pino | Structured JSON, fast |
| Jobs | BullMQ (opt-in) | Mature Redis-backed queue |
| Testing | Vitest + `supertest`-style for Hono | Fast, ESM-native |
| Package manager | pnpm | Deterministic, workspace-friendly |

## Directory layout

```
src/
├── modules/              # domain code - one folder per bounded context
│   ├── users/
│   │   ├── routes.ts     # Hono routes - thin HTTP layer
│   │   ├── service.ts    # business logic - pure functions where possible
│   │   ├── repository.ts # data access - only place that touches Drizzle
│   │   ├── schema.ts     # Zod schemas + Drizzle table definitions
│   │   ├── jobs.ts       # background jobs for this module (optional)
│   │   └── index.ts      # public API - only this is importable elsewhere
│   ├── billing/
│   └── <other modules>/
├── shared/
│   ├── config/           # typed env loader (Zod-validated)
│   ├── db/               # Drizzle client + migration setup
│   ├── auth/             # JWT sign/verify, requireAuth middleware
│   ├── errors/           # typed error classes
│   ├── logging/          # pino instance, request-id middleware
│   └── http/             # CORS, security headers, rate limit, error envelope
└── server.ts             # app factory + boot
```

## Module boundary rules

This is **the** rule. Everything else is consequence:

> Modules talk to each other ONLY through their `index.ts` public API.
> No module reaches into another module's repository, service implementation, or DB table.

Why: each module is theoretically extractable to its own service. If billing reaches into the users table directly, extracting users means breaking billing. Going through `index.ts` keeps the boundary clean.

In practice:
- `billing/service.ts` does `import { getUserById } from "@/modules/users";` (the index, not the file).
- It does NOT do `import { db } from "@/shared/db"; db.select().from(usersTable)...`
- Cross-module queries are forbidden. If you need joined data, the module that owns the data exposes a method.

## Layered concerns within a module

**Routes** (`routes.ts`):
- Parse request, validate with Zod, call service, format response.
- No business logic.
- No direct DB access.
- Return typed values; let the error middleware handle thrown errors.

**Service** (`service.ts`):
- All business logic lives here.
- Takes typed inputs, returns typed outputs.
- Pure where possible; impure parts call the repository or external clients.
- Unit-testable without HTTP or DB (mock the repo).

**Repository** (`repository.ts`):
- Thin wrapper over Drizzle. One function per query.
- Returns plain typed objects, not Drizzle query builders.
- Accepts optional transaction handle for multi-step service operations.

**Schema** (`schema.ts`):
- Zod schemas (validation, parsing).
- Drizzle table definitions.
- TypeScript types inferred from Zod and exported.

## Request lifecycle

```
Request → CORS → Security headers → Request ID → Logging context → Auth (optional) →
  Rate limit → Body validation (Zod) → Route handler → Service → Repository → DB →
Response → Error envelope (if thrown) → Logging → Response
```

All middleware lives in `src/shared/http/` and is wired in `server.ts`. The order matters.

## Error model

Defined in `src/shared/errors/`:

```ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super("NOT_FOUND", `${resource} ${id} not found`, 404);
  }
}

export class ValidationError extends AppError { /* ... */ }
export class UnauthorizedError extends AppError { /* ... */ }
export class ConflictError extends AppError { /* ... */ }
```

Routes throw typed errors. A single error middleware catches them and formats the envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "user abc not found", "details": null } }
```

## Configuration

```ts
// src/shared/config/index.ts
import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().default(8787),
  DATABASE_URL: z.string().url().or(z.string().startsWith("file:")),
  DATABASE_AUTH_TOKEN: z.string().optional(), // required for Turso, optional for file:
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CORS_ALLOWED_ORIGINS: z.string().transform(s => s.split(",")),
  REDIS_URL: z.string().url().optional(), // only when jobs are wired
});

export const config = ConfigSchema.parse(process.env);
```

If env is invalid, the process crashes at boot with a clear message. No silent fallbacks.

## Health endpoints

- `GET /healthz` - liveness. Returns 200 immediately. No DB check. K8s/load-balancer pokes this.
- `GET /readyz` - readiness. Pings the DB. Returns 200 only if the DB responds. Use for "is this instance ready to take traffic".

## Database transactions

Open at the service layer, never in the route, never in the repository:

```ts
// service.ts
export async function transferCredits(from: string, to: string, amount: number) {
  return db.transaction(async (tx) => {
    await usersRepo.debit(from, amount, tx);
    await usersRepo.credit(to, amount, tx);
    await ledgerRepo.recordTransfer(from, to, amount, tx);
  });
}
```

Repository methods accept an optional `tx` and use it when present:

```ts
// repository.ts
export async function debit(userId: string, amount: number, tx?: Transaction) {
  return (tx ?? db).update(users).set({ /* ... */ }).where(/* ... */);
}
```

## Idempotency

POST mutations that create or charge should support `Idempotency-Key` header. The idempotency middleware checks a key-store table (15-minute TTL) and replays the original response on collision. Critical for webhooks and payment flows.

See `docs/api-conventions.md` for the pattern.

## Testing posture

- Integration tests > unit tests for routes. Boot the app, hit the route, assert the response. Fast with libSQL `file::memory:`.
- Unit tests for service functions with pure logic. Mock the repository.
- No mocking the DB - use libSQL in-memory.
- Snapshot tests are off by default.

## What NOT to do

- Don't put logic in routes. Routes are HTTP, not domain.
- Don't reach across modules into repositories or DB. Go through `index.ts`.
- Don't use `process.env` outside `shared/config/`.
- Don't catch errors just to log them - let them propagate to the error middleware.
- Don't define interfaces for repositories with one implementation. YAGNI.
- Don't introduce a service mesh, gRPC, or event sourcing without an ADR.
