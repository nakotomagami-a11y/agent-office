# Background jobs

BullMQ + Redis. Opt-in - not wired by default. When you need it, here's the pattern.

## When to use a job (vs an inline function call)

Use a job when:
- The work is slow (>200ms) and shouldn't block the response
- The work might fail and needs retry
- The work is scheduled (run at time X, or every N hours)
- The work might be triggered from multiple places (queue gives you a single processor)

Don't use a job for:
- Fast in-process work (just call the function)
- Anything where the caller needs the result back (use a function or a sync API)

## Setup

Install:

```bash
pnpm add bullmq ioredis
```

```ts
// src/shared/jobs/connection.ts
import { Redis } from "ioredis";
import { config } from "@/shared/config";

if (!config.REDIS_URL) throw new Error("REDIS_URL required for jobs");

export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
```

## Per-module jobs

```ts
// src/modules/billing/jobs.ts
import { Queue, Worker } from "bullmq";
import { redis } from "@/shared/jobs/connection";
import * as billingService from "./service";

const QUEUE_NAME = "billing";

export const billingQueue = new Queue<BillingJobs>(QUEUE_NAME, { connection: redis });

type BillingJobs =
  | { name: "generate-invoice"; data: { userId: string; periodStart: number; periodEnd: number } }
  | { name: "charge-failed-payments"; data: Record<string, never> };

// Worker - lives in a separate process in prod, can run in-process in dev
export function startBillingWorker() {
  return new Worker<BillingJobs["data"]>(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case "generate-invoice":
          return billingService.generateInvoice(job.data);
        case "charge-failed-payments":
          return billingService.chargeFailedPayments();
      }
    },
    { connection: redis, concurrency: 5 },
  );
}
```

## Enqueueing from a service

```ts
// src/modules/billing/service.ts
import { billingQueue } from "./jobs";

export async function scheduleInvoice(userId: string, periodStart: number, periodEnd: number) {
  await billingQueue.add(
    "generate-invoice",
    { userId, periodStart, periodEnd },
    {
      jobId: `invoice:${userId}:${periodStart}`, // idempotency at the queue level
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
    },
  );
}
```

## Scheduled jobs

```ts
// src/modules/billing/jobs.ts
await billingQueue.add(
  "charge-failed-payments",
  {},
  { repeat: { pattern: "0 6 * * *" } }, // every day at 6am UTC
);
```

Add scheduled jobs in a boot script (`src/scripts/register-schedules.ts`) so the cron tasks aren't duplicated across worker restarts.

## Running workers

In dev: same process as the server (simpler).

```ts
// src/server.ts
import { startBillingWorker } from "@/modules/billing/jobs";

if (config.NODE_ENV === "development") {
  startBillingWorker();
}
```

In prod: separate process (`pnpm worker`) so worker crashes don't take down the API.

## Idempotency

Two layers:
1. `jobId` - identical jobIds are deduplicated. Use a deterministic ID when possible.
2. Inside the job handler, treat re-execution as safe. A job CAN run twice if a worker crashes mid-execution. Make the side effects idempotent (UPSERT, conditional INSERT).

## Lightweight alternative: DB-backed queue

If Redis is too heavy a dependency, use a `jobs` table:

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

A polling worker picks up `status='pending' AND scheduled_at <= now()`, marks `status='running'`, runs, marks `done` or `failed`.

Pros: zero new infra. Cons: no fan-out, no priority, no rate limiting, awkward retries. Fine for one or two job types; falls apart beyond that.

## What NOT to do

- Don't block the request on a job's completion. The whole point is async.
- Don't put business logic in `jobs.ts`. The job dispatches to the service.
- Don't share queues across modules. Each module owns its queue.
- Don't run workers in the same process as the API in prod.
- Don't catch errors in a job just to log them - let BullMQ's retry machinery work.
