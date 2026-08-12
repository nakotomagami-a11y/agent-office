# Observability

What we log, how we trace requests, what health checks tell us.

## Logging - structlog

```bash
uv add structlog
```

```python
# app/shared/logging/__init__.py
import logging
import structlog
from app.shared.config import config

def setup_logging():
    timestamper = structlog.processors.TimeStamper(fmt="iso")
    processors = [
        structlog.stdlib.add_log_level,
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if config.NODE_ENV == "development":
        processors.append(structlog.dev.ConsoleRenderer())
    else:
        processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if config.NODE_ENV == "development" else logging.INFO,
        ),
        cache_logger_on_first_use=True,
    )

log = structlog.get_logger()
```

## Log levels

- `error` - broke
- `warning` - degraded but functional
- `info` - lifecycle events
- `debug` - dev-time detail

NEVER log: passwords, tokens, secrets, full bodies, user-controlled content as the first format arg.

## Request ID propagation

```python
# app/shared/http/request_id.py
import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
import structlog

class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get("X-Request-ID")
        request_id = incoming or str(uuid.uuid4())
        request.state.request_id = request_id

        structlog.contextvars.bind_contextvars(request_id=request_id)
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = request_id
            return response
        finally:
            structlog.contextvars.clear_contextvars()
```

`bind_contextvars` attaches the request_id to every log line for the duration of the request.

## Request logging middleware

```python
class RequestLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        import time
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = (time.monotonic() - start) * 1000
        log.info(
            "request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round(duration_ms, 2),
        )
        return response
```

## Health endpoints

```python
@app.get("/healthz")
async def healthz():
    return {"ok": True}

@app.get("/readyz")
async def readyz(session: AsyncSession = Depends(get_session)):
    try:
        await session.execute(text("SELECT 1"))
        return {"ok": True}
    except Exception:
        raise HTTPException(status_code=503, detail="db_unreachable")
```

Same separation as Node: liveness ≠ readiness.

## Tracing (optional)

Add OpenTelemetry when you have ≥2 services calling each other:

```bash
uv add opentelemetry-distro opentelemetry-instrumentation-fastapi \
       opentelemetry-instrumentation-sqlalchemy opentelemetry-exporter-otlp
```

Auto-instrument FastAPI and SQLAlchemy:

```python
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

FastAPIInstrumentor.instrument_app(app)
SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)
```

Export to Jaeger, Tempo, Honeycomb via OTLP.

## Metrics (optional)

`prometheus-fastapi-instrumentator`:

```bash
uv add prometheus-fastapi-instrumentator
```

```python
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app, endpoint="/metrics")
```

Scrape from inside your VPC, never expose publicly.

## Error responses

The `AppError` handler from `ARCHITECTURE.md`:

```python
async def app_error_handler(request, exc: AppError) -> JSONResponse:
    log.warning("app_error", code=exc.code, status=exc.status, message=exc.message)
    return JSONResponse(
        status_code=exc.status,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )

async def unhandled_handler(request, exc: Exception) -> JSONResponse:
    log.error("unhandled_error", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL", "message": "Internal error"}},
    )
```

Never leak stack traces in responses.

## What NOT to do

- Don't `print()`. Use structlog.
- Don't log in hot loops. Aggregate then log.
- Don't log PII. Run a regex scan in CI.
- Don't make health checks expensive.
- Don't return stack traces.
