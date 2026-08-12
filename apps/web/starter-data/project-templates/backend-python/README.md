# {{PROJECT_NAME}} - backend

FastAPI + SQLAlchemy 2.0 + libSQL.

## Run locally

```bash
uv sync
cp .env.example .env
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

API at `http://localhost:8000`. OpenAPI docs at `/docs` (dev only).

## Environment

See `.env.example`. Required:

- `DATABASE_URL` - `sqlite+libsql:///./local.db` for dev, `sqlite+libsql://...` for Turso prod
- `DATABASE_AUTH_TOKEN` - required for Turso Cloud
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` - 32+ char random strings
- `CORS_ALLOWED_ORIGINS` - JSON list

## Migrations

```bash
uv run alembic revision --autogenerate -m "add users table"
uv run alembic upgrade head
uv run alembic downgrade -1
```

## Project docs

- `CLAUDE.md` - house rules
- `ARCHITECTURE.md` - layered + modular monolith structure
- `DECISIONS.md` - ADRs
- `PLAN.md` - current work
- `docs/` - topic deep-dives
