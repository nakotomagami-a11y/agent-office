# {{PROJECT_NAME}} - backend

Hono + Drizzle + libSQL.

## Run locally

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Defaults to `http://localhost:8787`.

## Environment

See `.env.example`. Required:

- `DATABASE_URL` - `file:./local.db` for dev, `libsql://...` for prod
- `DATABASE_AUTH_TOKEN` - only required for Turso Cloud
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` - 32+ char random strings
- `CORS_ALLOWED_ORIGINS` - comma-separated

## Migrations

```bash
pnpm db:generate   # generate a migration from schema diff
pnpm db:migrate    # apply pending migrations
pnpm db:studio     # open Drizzle Studio
```

## Project docs

- `CLAUDE.md` - house rules
- `ARCHITECTURE.md` - layered + modular monolith structure
- `DECISIONS.md` - ADRs
- `PLAN.md` - current work
- `docs/` - topic deep-dives
