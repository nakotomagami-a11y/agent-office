# Architecture - {{PROJECT_NAME}} backend

How the Python backend is organized.

## Stack summary

| Layer | Choice | Why |
|---|---|---|
| Runtime | Python 3.12+ via uv | Async, modern type system, fast install |
| Framework | FastAPI | Async-first, Pydantic-native, free OpenAPI docs |
| Validation | Pydantic v2 | Same models for HTTP + types + docs |
| ORM | SQLAlchemy 2.0 (async) | Documented libSQL support |
| Database | libSQL via `sqlalchemy-libsql` | SQLite ergonomics, Turso Cloud for prod |
| Migrations | Alembic | Industry standard for SQLAlchemy |
| Auth | python-jose (JWT) | Mature, standard-compliant |
| Logging | structlog | Structured, async-friendly |
| Jobs | ARQ (opt-in) | Async-native Redis queue |
| Testing | pytest + httpx | Async test client, fast |

## Directory layout

```
app/
├── modules/              # domain code
│   ├── users/
│   │   ├── routes.py     # FastAPI router - thin
│   │   ├── service.py    # business logic
│   │   ├── repository.py # data access - SQLAlchemy lives here
│   │   ├── schemas.py    # Pydantic models
│   │   ├── models.py     # SQLAlchemy ORM models
│   │   ├── jobs.py       # background jobs (optional)
│   │   └── __init__.py   # public API
│   ├── billing/
│   └── <other modules>/
├── shared/
│   ├── config/           # Pydantic BaseSettings env loader
│   ├── db/               # async engine, session factory
│   ├── auth/             # JWT sign/verify, require_auth dependency
│   ├── errors/           # typed AppError classes + handler
│   ├── logging/          # structlog setup, request-id middleware
│   └── http/             # CORS, security, rate limit
├── deps.py               # FastAPI dependency injection setup
└── main.py               # app factory + boot
```

## App factory pattern

```python
# app/main.py
from fastapi import FastAPI
from app.shared.config import config
from app.shared.errors import register_exception_handlers
from app.shared.http import register_middleware
from app.shared.logging import setup_logging
from app.modules.users.routes import router as users_router
from app.modules.billing.routes import router as billing_router

def create_app() -> FastAPI:
    setup_logging()
    app = FastAPI(
        title=config.APP_NAME,
        version=config.APP_VERSION,
        docs_url="/docs" if config.NODE_ENV != "production" else None,
    )
    register_middleware(app)
    register_exception_handlers(app)
    app.include_router(users_router, prefix="/users", tags=["users"])
    app.include_router(billing_router, prefix="/billing", tags=["billing"])
    return app

app = create_app()
```

Why a factory: testable (you can create a fresh app per test), explicit boot order, single place to wire things.

## Module boundary rules

> Modules talk to each other ONLY through their `__init__.py` public API.

```python
# app/modules/users/__init__.py
from .service import get_by_id, create
from .schemas import User, NewUser

__all__ = ["get_by_id", "create", "User", "NewUser"]
```

```python
# Good
from app.modules.users import get_by_id, User

# Bad - reaching into internals
from app.modules.users.repository import get_by_id_query
from app.shared.db import get_session  # then querying users directly
```

Doc-enforced for now. Future: `import-linter` config in CI.

## Layered concerns within a module

**Router** (`routes.py`):
- `APIRouter` with FastAPI route handlers.
- Parse query/path/body via FastAPI's typed params; validation is automatic.
- Call service. Return Pydantic models (FastAPI serializes them).
- No business logic, no DB calls.

**Service** (`service.py`):
- All business logic.
- Async functions, take typed inputs, return typed outputs.
- Accepts dependencies as parameters (session, repos) - this is how DI works.

**Repository** (`repository.py`):
- The ONLY place that touches SQLAlchemy.
- One async function per query.
- Returns Pydantic models, not SQLAlchemy ORM instances (decouples callers from ORM).

**Schemas** (`schemas.py`):
- Pydantic models. Input (`NewUser`), output (`User`), patch (`UserPatch`).
- Cleanly separated from ORM models (which live in `models.py`).

**Models** (`models.py`):
- SQLAlchemy declarative models.
- Used only by `repository.py`.

## Dependency injection

FastAPI's `Depends` for everything cross-cutting:

```python
# app/deps.py
from typing import AsyncIterator
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.shared.db import async_session_factory

async def get_session() -> AsyncIterator[AsyncSession]:
    async with async_session_factory() as session:
        yield session

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    return await auth_service.verify_access_token(token)
```

```python
# app/modules/users/routes.py
@router.get("/{user_id}")
async def get_user(
    user_id: str,
    session: AsyncSession = Depends(get_session),
    current: User = Depends(get_current_user),
):
    return await users_service.get_by_id(session, user_id)
```

Session-per-request, automatic close on exit. The service takes the session as an argument.

## Request lifecycle

```
Request → CORS → Security headers → Request ID → Logging context → Auth (optional) →
  Rate limit → Pydantic validation → Route handler → Service → Repository → DB →
Response → Exception handler (if raised) → Logging → Response
```

## Error model

```python
# app/shared/errors/base.py
class AppError(Exception):
    code: str = "INTERNAL"
    status: int = 500
    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details

class NotFoundError(AppError):
    code = "NOT_FOUND"
    status = 404

class ValidationError(AppError):
    code = "VALIDATION"
    status = 400

class UnauthorizedError(AppError):
    code = "UNAUTHORIZED"
    status = 401

class ConflictError(AppError):
    code = "CONFLICT"
    status = 409
```

Exception handler:

```python
# app/shared/errors/handlers.py
from fastapi import Request
from fastapi.responses import JSONResponse

async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )
```

Wired in `register_exception_handlers(app)`.

## Configuration

```python
# app/shared/config/__init__.py
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Config(BaseSettings):
    NODE_ENV: str = Field(pattern="^(development|test|production)$")
    PORT: int = 8000
    DATABASE_URL: str  # sqlite+libsql:///./local.db OR sqlite+libsql://... for Turso
    DATABASE_AUTH_TOKEN: str | None = None
    JWT_ACCESS_SECRET: str = Field(min_length=32)
    JWT_REFRESH_SECRET: str = Field(min_length=32)
    CORS_ALLOWED_ORIGINS: list[str]
    REDIS_URL: str | None = None  # only when jobs are wired

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

config = Config()  # type: ignore[call-arg]
```

Invalid env → boot crashes with a clear Pydantic validation error.

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

## Transactions

Open at the service layer:

```python
async def transfer_credits(session: AsyncSession, from_id: str, to_id: str, amount: int):
    async with session.begin():
        await users_repo.debit(session, from_id, amount)
        await users_repo.credit(session, to_id, amount)
        await ledger_repo.record(session, from_id, to_id, amount)
```

`session.begin()` opens a nested transaction (or starts one if none active). Rolls back on exception.

Repositories take `session: AsyncSession` as the first argument. They never open their own transactions.

## Idempotency

POST mutations support `Idempotency-Key` header. See `docs/api-conventions.md`.

## Testing posture

- Integration tests > unit tests for routes. `httpx.AsyncClient(app=app)` boots in-memory.
- Use libSQL `file::memory:` for the test DB.
- Unit tests for pure service functions. Mock repos as needed.
- Snapshot tests off by default.

## What NOT to do

- Don't use sync SQLAlchemy with async FastAPI. Mismatched paradigms.
- Don't put queries in routers. Routers call services.
- Don't reach across modules into repos or models. Public API via `__init__.py`.
- Don't use `os.environ` outside `app/shared/config/`.
- Don't add SQLModel. SQLAlchemy 2.0 + Pydantic is the choice (ADR-worthy to change).
- Don't catch generic `Exception` just to log. Let typed errors hit the handler.
