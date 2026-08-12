# {{PROJECT_NAME}} - backend

Python backend. FastAPI + uv + SQLAlchemy 2.0 + libSQL.

## What this is

One-liner: _replace this with what this service does_.

## Stack

- **Runtime**: Python 3.12+ (via `uv`)
- **Framework**: FastAPI - async-first, Pydantic-native, OpenAPI for free
- **Package manager**: `uv` - fast, deterministic, lockfile-based
- **Validation**: Pydantic v2 at every boundary
- **ORM**: SQLAlchemy 2.0 (NOT SQLModel - libSQL dialect support is documented for SQLAlchemy, unverified for SQLModel)
- **Database**: libSQL via `sqlalchemy-libsql` dialect + `libsql` driver. Local dev: `file:./local.db`. Prod: Turso Cloud.
- **Migrations**: Alembic
- **Auth**: JWT access + refresh tokens via `python-jose` or `PyJWT`. Cookie when same-domain, `Authorization: Bearer` otherwise.
- **Background jobs**: ARQ (Redis-backed, async-native) - documented in `docs/background-jobs.md`. Not wired by default.
- **Logging**: structlog (structured JSON)
- **Testing**: pytest + httpx AsyncClient

## House rules (non-negotiable)

1. **Routers are thin.** Parse, validate, call service, return response.
2. **Services don't know about HTTP.** Pure Python functions where possible.
3. **Repositories are the only place that touches SQLAlchemy.** Services call repositories.
4. **Validate at the boundary.** Pydantic schemas at HTTP routes and external API calls.
5. **No `os.environ[...]` outside `app/shared/config/`.** Boot fails loud if config invalid.
6. **No cross-module DB access.** Modules talk through their `__init__.py` public API.
7. **Errors are typed.** Raise an `AppError` subclass; an exception handler formats the response.
8. **Type hints are mandatory.** `mypy --strict` (or pyright strict). No implicit `Any`.
9. **Async by default.** FastAPI is async; routes use `async def`; DB calls use the async SQLAlchemy session.

## Before you change X, read Y

- Adding a new module → `docs/modules.md`
- Adding an API endpoint → `docs/api-conventions.md`
- Changing the data layer → `docs/data-layer.md`
- Adding a background job → `docs/background-jobs.md`
- Touching auth → `docs/auth.md`
- Big architectural change → `ARCHITECTURE.md` + add an ADR to `DECISIONS.md`

## Out of scope

- Hosting an admin UI (separate frontend)
- Email templates / sending (use a transactional email service)
- Heavy file processing (use background jobs)
- _add project-specific exclusions_

## Memory

- Read on every Claude session. Keep current.
- Lessons learned → `DECISIONS.md`. Active work → `PLAN.md`.
