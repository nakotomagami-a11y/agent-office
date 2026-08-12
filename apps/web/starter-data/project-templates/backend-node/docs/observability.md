# Observability

What we log, how we trace requests, and what health checks tell us.

## Logging - pino

`pino` for structured JSON logs. Fast, low overhead.

```ts
// src/shared/logging/index.ts
import { pino } from "pino";
import { config } from "@/shared/config";

export const log = pino({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  formatters: {
    level: (label) => ({ level: label }),
  },
});
```

In dev: pipe to `pino-pretty` for readable output. In prod: raw JSON, shipped to your log aggregator.

## Log levels

- `error` - something broke, on-call attention warranted
- `warn` - something is off, degraded but functioning
- `info` - lifecycle events (boot, request finished, job complete)
- `debug` - detail useful while developing

Never log:
- Passwords, tokens, secrets, API keys
- Full request bodies (might contain PII or large payloads)
- User-controlled content as the first arg of `log.error(...)` (log injection risk)

## Request ID propagation

Every request gets an ID. Logs from a request carry that ID. Easy to grep one request across the whole system.

```ts
// src/shared/http/request-id.ts
import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export const requestId: MiddlewareHandler = async (c, next) => {
  const incoming = c.req.header("X-Request-ID");
  const id = incoming ?? randomUUID();
  c.set("requestId", id);
  c.header("X-Request-ID", id);
  await next();
};
```

A request-scoped logger:

```ts
// src/shared/logging/request-logger.ts
import type { MiddlewareHandler } from "hono";
import { log } from "./index";

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const requestId = c.get("requestId");
  const reqLog = log.child({ requestId, method: c.req.method, path: c.req.path });
  c.set("log", reqLog);

  try {
    await next();
  } finally {
    reqLog.info({ status: c.res.status, durationMs: Date.now() - start }, "request");
  }
};
```

In a route or service: `c.get("log").info({ ... }, "user_created")`.

## Health endpoints

**`GET /healthz`** - liveness. Return 200 if the process is alive.

```ts
app.get("/healthz", (c) => c.json({ ok: true }));
```

K8s / load balancer uses this to know if the process should be restarted.

**`GET /readyz`** - readiness. Return 200 only if the process can serve traffic (DB reachable).

```ts
app.get("/readyz", async (c) => {
  try {
    await db.execute("SELECT 1");
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 503);
  }
});
```

The load balancer uses this to decide whether to send traffic. A healthy-but-not-ready instance gets pulled from rotation.

Don't mix the two. A failing DB shouldn't restart the process (liveness); it should just stop traffic (readiness).

## Tracing (optional)

For a service that calls other services or makes many DB queries per request, OpenTelemetry tracing helps. Add when:
- You have ≥2 services calling each other
- A "slow request" investigation requires looking at multiple spans

Until then, structured logs + request ID are enough.

When you add it: `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node`. Export to your tracing backend (Jaeger, Tempo, Honeycomb).

## Metrics (optional)

Prometheus-shape metrics via `prom-client`. Add when you need dashboards:
- Request rate, error rate, latency (RED method)
- Job queue depth, processing time
- DB connection pool utilization

Expose at `/metrics`. Don't expose publicly - scrape from inside your VPC.

## Errors

Errors that escape route handlers hit the error middleware:

```ts
// src/shared/http/error-handler.ts
import type { ErrorHandler } from "hono";
import { AppError } from "@/shared/errors";

export const errorHandler: ErrorHandler = (err, c) => {
  const log = c.get("log");

  if (err instanceof AppError) {
    log.warn({ code: err.code, status: err.status, details: err.details }, err.message);
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.status as 400 | 401 | 403 | 404 | 409 | 422,
    );
  }

  log.error({ err }, "unhandled_error");
  return c.json({ error: { code: "INTERNAL", message: "Internal error" } }, 500);
};
```

Note: `AppError` codes are stable identifiers consumers can branch on. Unhandled errors return a generic `INTERNAL` - never leak stack traces or messages.

## What NOT to do

- Don't `console.log`. Always go through pino.
- Don't log inside hot loops. Aggregate then log.
- Don't log PII or secrets. Run a regex scan in CI.
- Don't make health checks expensive. `/healthz` should return in <10ms.
- Don't return stack traces in error responses.
