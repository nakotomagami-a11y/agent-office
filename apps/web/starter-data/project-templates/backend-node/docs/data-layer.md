# Data layer

Drizzle ORM + libSQL (via `@libsql/client`). SQLite dialect.

## Connection string

- **Local dev**: `DATABASE_URL=file:./local.db` - a SQLite file on disk. No auth token. No server. Fast.
- **In-memory** (tests): `DATABASE_URL=file::memory:` - lives only as long as the process.
- **Prod (Turso Cloud)**: `DATABASE_URL=libsql://<your-db>.turso.io` + `DATABASE_AUTH_TOKEN=<token>`. Get both from `turso db show <name> --url` and `turso db tokens create <name>`.

The libSQL client handles all three transparently. Same code, same SQL.

## Drizzle setup

```ts
// src/shared/db/client.ts
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { config } from "@/shared/config";

const client = createClient({
  url: config.DATABASE_URL,
  authToken: config.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client);
export type Database = typeof db;
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
```

`Transaction` is a useful exported type - repositories take `tx?: Transaction` for atomic multi-step ops.

## Schema location

Drizzle schemas live in each module:

```
src/modules/users/schema.ts  ← users table, sessions table
src/modules/billing/schema.ts ← invoices table
```

Each module's `schema.ts` exports its tables. A single `src/shared/db/schema.ts` re-exports them for `drizzle-kit`:

```ts
export * from "@/modules/users/schema";
export * from "@/modules/billing/schema";
```

This keeps Drizzle Studio + migrations aware of all tables without violating module boundaries (schemas are still per-module).

## Migrations

```bash
pnpm db:generate  # diff schema vs current migrations, write a new .sql
pnpm db:migrate   # apply pending .sql files
```

Migrations live in `drizzle/`. Commit them. Never edit a shipped migration - write a new one to fix issues.

Rules:
- One logical change per migration. Don't bundle unrelated alters.
- Additive when possible. Removing a column should be a two-step deploy (stop writing, then drop).
- Test migrations against a fresh DB AND against a copy of prod (or staging).

## Repository pattern

The repository is the **only** place that touches Drizzle. Services call it.

```ts
// src/modules/users/repository.ts
import { eq } from "drizzle-orm";
import { db, type Transaction } from "@/shared/db/client";
import { users } from "./schema";

export async function getById(id: string, tx?: Transaction) {
  const rows = await (tx ?? db).select().from(users).where(eq(users.id, id));
  return rows[0] ?? null;
}

export async function create(data: NewUser, tx?: Transaction) {
  const [row] = await (tx ?? db).insert(users).values(data).returning();
  return row!;
}
```

- Functions return plain objects, not Drizzle builders.
- Take optional `tx` for transaction participation.
- One function per query. No `getUserBy(...args)` mega-functions.

## Transactions

Open at the service layer:

```ts
// src/modules/billing/service.ts
import { db } from "@/shared/db/client";

export async function transferCredits(from: string, to: string, amount: number) {
  return db.transaction(async (tx) => {
    await usersRepo.debit(from, amount, tx);
    await usersRepo.credit(to, amount, tx);
    await ledgerRepo.recordTransfer(from, to, amount, tx);
  });
}
```

Drizzle's `transaction` rolls back on any thrown error. Just let typed errors propagate.

## Cross-module access

Forbidden via the repository. If billing needs user data, it calls `usersModule.getById()` (from `src/modules/users/index.ts`), not the users repository.

`src/modules/users/index.ts`:

```ts
export { getById, create } from "./service";
export type { User, NewUser } from "./schema";
```

Notice: services are exposed, repositories are NOT.

## What NOT to do

- Don't use raw SQL strings. Drizzle's query builder is type-safe; use it.
- Don't put queries in route handlers. Routes call services.
- Don't add Prisma. Drizzle is the choice (ADR-worthy to change).
- Don't query across modules. Compose at the service layer.
- Don't use `drizzle-orm/sqlite-core` directly for libSQL - use the `drizzle-orm/libsql` adapter so connection features (sync, replicas) work later.
