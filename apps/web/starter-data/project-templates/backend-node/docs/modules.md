# Modules

The modular monolith. Each module is theoretically its own service - they happen to run in the same process.

## Why modular monolith (not microservices)

Microservices solve problems we don't have: independent deploys per team, language autonomy, components with wildly different scaling profiles. They create problems we don't want: network reliability, distributed transactions, operational complexity.

Modular monolith gives us the architectural benefit (clean boundaries, extractability) without the operational tax. If a module ever needs to be extracted, the cost is "wrap its function calls in HTTP" - not "rewrite the whole thing."

See `docs/module-extraction.md` for the recipe when (if) the time comes.

## Module structure

```
src/modules/<name>/
├── routes.ts        # HTTP routes - thin
├── service.ts       # business logic
├── repository.ts    # data access
├── schema.ts        # Zod + Drizzle schemas
├── jobs.ts          # background jobs (optional)
├── events.ts        # internal events emitted/handled (optional)
├── _internal/       # helpers used only within the module
└── index.ts         # public API
```

## The public API rule

`index.ts` is the ONLY file other modules may import from.

```ts
// src/modules/users/index.ts
export { create, getById, getByEmail } from "./service";
export type { User, NewUser } from "./schema";
// repository is NOT exported. Other modules can't see it.
```

Other modules:

```ts
// ✅ Good
import { getById, type User } from "@/modules/users";

// ❌ Bad - reaching into internals
import { getById } from "@/modules/users/service";
import { db } from "@/shared/db"; // then querying users table directly
```

This rule is currently doc-enforced. A future improvement is an ESLint boundary rule (see `docs/module-extraction.md`).

## When to add a new module

A module represents a bounded context: a set of concepts that change together and have their own consistency rules. Examples:

- `users` - identity, sessions, profiles
- `billing` - subscriptions, invoices, ledger
- `notifications` - email, push, in-app
- `agents` - in this app's case

Not modules:
- A folder for "utilities" (that's `src/shared/`)
- A folder for one entity (a single table) without behavior - that's premature splitting

When in doubt: start in an existing module. Extract when the seams become obvious (separate consistency rules, separate domain language, separate change cadence).

## Cross-module communication

Three patterns, in order of preference:

### 1. Direct function call (default)

```ts
// billing/service.ts
import { getById as getUser } from "@/modules/users";

export async function createInvoice(userId: string) {
  const user = await getUser(userId);
  // ...
}
```

Simple. Synchronous. Cost is one function call.

### 2. Module event (when you need decoupling)

For "fire and forget" or fan-out events:

```ts
// shared/events.ts
import { EventEmitter } from "node:events";
export const bus = new EventEmitter();

// users/service.ts
bus.emit("user.created", { id: user.id, email: user.email });

// notifications/index.ts
bus.on("user.created", async (payload) => {
  await sendWelcomeEmail(payload.email);
});
```

Use this when the publisher doesn't care about the consumer's success and the consumer is doing async work.

### 3. Background job (for slow work)

When the consumer's work is slow or needs retry:

```ts
// billing/jobs.ts
await invoiceQueue.add("generate-monthly-invoices", { userId });
```

See `docs/background-jobs.md`.

## What goes in `shared/`

Genuinely cross-cutting: config loading, DB client, logger, error classes, HTTP middleware.

NOT in shared:
- Anything domain-specific (users, billing, etc.) - those are modules
- "Utility" functions used by one module - keep them in the module

When a shared utility is used by zero modules and one project script, move it to that script.

## What NOT to do

- Don't share types across modules by importing them from `_internal/`. Export them from `index.ts`.
- Don't create a `shared/types.ts` for "common" domain types. They belong to a module.
- Don't introduce a DI container. Module imports are dependency injection.
- Don't write event listeners for events the same module emits. Just call the function.
