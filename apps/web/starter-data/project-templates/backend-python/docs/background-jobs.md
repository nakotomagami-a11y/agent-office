# Background jobs

ARQ (async-native, Redis-backed). Opt-in. Not wired by default.

## When to use a job

Same heuristic as the Node template:
- Slow work (>200ms) shouldn't block the response
- Work that might fail and need retry
- Scheduled work
- Single-processor work triggered from multiple places

## Install

```bash
uv add arq
```

## Setup

```python
# app/shared/jobs/__init__.py
from arq.connections import RedisSettings
from app.shared.config import config

if not config.REDIS_URL:
    raise RuntimeError("REDIS_URL required for jobs")

redis_settings = RedisSettings.from_dsn(config.REDIS_URL)
```

## Per-module jobs

```python
# app/modules/billing/jobs.py
from arq import cron
from app.shared.jobs import redis_settings
from . import service as billing_service

async def generate_invoice(ctx, user_id: str, period_start: int, period_end: int):
    async with ctx["session_factory"]() as session:
        await billing_service.generate_invoice(session, user_id, period_start, period_end)

async def charge_failed_payments(ctx):
    async with ctx["session_factory"]() as session:
        await billing_service.charge_failed_payments(session)

class BillingWorker:
    functions = [generate_invoice]
    cron_jobs = [cron(charge_failed_payments, hour=6, minute=0)]
    redis_settings = redis_settings

    @staticmethod
    async def startup(ctx):
        from app.shared.db import async_session_factory
        ctx["session_factory"] = async_session_factory
```

## Enqueueing from a service

```python
# app/modules/billing/service.py
from arq import create_pool
from app.shared.jobs import redis_settings

async def schedule_invoice(user_id: str, period_start: int, period_end: int):
    pool = await create_pool(redis_settings)
    await pool.enqueue_job(
        "generate_invoice",
        user_id, period_start, period_end,
        _job_id=f"invoice:{user_id}:{period_start}",  # idempotency
    )
```

For high-frequency enqueueing, hold the pool at app level instead of recreating it.

## Running workers

Dev: in-process via FastAPI startup, OR a separate process - either works.

Prod: ALWAYS a separate process. `arq app.modules.billing.jobs.BillingWorker`.

## Idempotency

Two layers:
1. `_job_id` - identical IDs dedupe in the queue.
2. Inside the job: treat re-execution as safe. Workers can crash. Make side effects idempotent (UPSERT, conditional INSERT).

## Lightweight alternative: DB-backed queue

When Redis is too heavy:

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

A polling worker (asyncio task) picks up pending rows. Fine for one or two job types; falls apart beyond that.

## What NOT to do

- Don't block the request on job completion.
- Don't put business logic in `jobs.py`. The job dispatches to the service.
- Don't share queues across modules.
- Don't run workers in the same process as the API in prod.
- Don't catch errors in a job to log - let ARQ's retry handle them.
