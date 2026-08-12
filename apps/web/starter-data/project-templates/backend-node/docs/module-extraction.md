# Module extraction

When (if) a module ever needs to become its own service. The modular structure makes this a non-rewrite.

## When to extract

Real signals:
- This module is scaling differently from the rest (10x the traffic, or 10x the CPU).
- This module has a different SLO than the rest (strict latency vs. batch).
- A second team owns this module and deploys independently.
- This module needs different infrastructure (e.g. GPU access).

NOT signals:
- "It feels big" - size alone is not a reason.
- "We might need it later" - extract when you actually need it.
- "Microservices are best practice" - they're a trade-off, not a default.

## The recipe

Assume `billing` is being extracted.

### 1. Define the HTTP contract

Look at every `import { ... } from "@/modules/billing"` across the codebase. Those are the public functions.

For each function, define an HTTP endpoint:

```
getInvoice(id: string)         → GET /billing/invoices/:id
createInvoice(data: NewInvoice)  → POST /billing/invoices
listInvoices(userId: string)   → GET /billing/users/:userId/invoices
```

Use the same Zod schemas - copy them to the new service.

### 2. Build the new service

Create a new repo from this same template (`backend-node`). Copy the `billing` module into it as the only domain module. Wire up `routes.ts` to the HTTP endpoints defined above.

The new service has its own DB connection. Billing's tables move to its DB.

If billing needs to read user data, it calls the original service over HTTP (a new client in `src/lib/users-client.ts`).

### 3. Swap the client

In the original service, replace `src/modules/billing/index.ts` with an HTTP client:

```ts
// src/modules/billing/index.ts (after extraction)
import { config } from "@/shared/config";

export async function getInvoice(id: string): Promise<Invoice> {
  const res = await fetch(`${config.BILLING_SERVICE_URL}/billing/invoices/${id}`, {
    headers: { "X-Service-Token": config.BILLING_SERVICE_TOKEN },
  });
  if (!res.ok) throw new AppError(/* ... */);
  return InvoiceSchema.parse(await res.json());
}

export { type Invoice } from "./types";
```

Every existing caller (`import { getInvoice } from "@/modules/billing"`) keeps working unchanged.

### 4. Migrate data

Plan the cutover:
- Stop writes to the old billing tables.
- Snapshot, ship to the new service.
- Resume writes (now hitting the new service).
- Schedule the old tables for drop after a safety window (weeks).

### 5. Delete the old code

Once verified, remove `src/modules/billing/_internal/`, `service.ts`, `repository.ts`, `schema.ts`. Keep `index.ts` as the HTTP client. Keep the types in a shared shape.

## What you GAIN by extracting

- Independent deploys
- Independent scaling
- Independent infra (DB, Redis, runtime)

## What you LOSE

- Network reliability (now every billing call can fail or be slow)
- Distributed transactions (you can no longer atomically debit AND record - choose eventually-consistent patterns)
- Local-dev simplicity (now two services to boot)
- Refactoring speed (function signature changes are now versioned HTTP changes)

These costs are real. Don't extract unless the benefits clearly exceed them.

## Lint rule (optional, recommended)

Once the codebase has 5+ modules, enforce boundaries with ESLint:

```js
// .eslintrc
"import/no-internal-modules": ["error", {
  forbid: ["@/modules/*/!(index)", "@/modules/*/!(index)/**"]
}]
```

This prevents `import { db } from "@/modules/billing/repository"` from compiling.

## What NOT to do

- Don't extract speculatively. Wait for a real reason.
- Don't share databases across services after extraction. Each service owns its DB.
- Don't extract one module at a time as the new normal. The default should remain "modular monolith." Extraction is the exception.
- Don't keep the original module's table in the original DB after extraction. Migrate it.
