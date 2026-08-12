# {{PROJECT_NAME}} - backend

Node.js backend. Hono + TypeScript + Drizzle + libSQL.

## What this is

One-liner: _replace this with what this service does_.

## Stack

- **Runtime**: Node.js 24+ (LTS)
- **Framework**: Hono - lightweight, edge-ready, TypeScript-native
- **Language**: TypeScript, strict mode
- **Validation**: Zod at every boundary (HTTP in, external API in)
- **ORM**: Drizzle + `@libsql/client`
- **Database**: libSQL (production C fork). Local dev uses `file:./local.db`, prod points at Turso Cloud.
- **Auth**: JWT access + refresh tokens via `jose`. Cookie transport when frontend is same-domain, `Authorization: Bearer` when API-only.
- **Background jobs**: BullMQ (Redis-backed) - documented in `docs/background-jobs.md`. Not wired by default.
- **Logging**: pino (structured JSON)
- **Testing**: Vitest, integration tests over routes preferred

## House rules (non-negotiable)

1. **Routes are thin.** Parse, validate, call service, format response. Zero business logic.
2. **Services don't know about HTTP.** They take typed inputs, return typed outputs. Testable without booting a server.
3. **Repositories are the only place that touches the ORM.** Services call repositories.
4. **Validate at the boundary.** Zod schemas at HTTP routes and external API calls. Trust the types inside the perimeter.
5. **No `process.env.X` outside `src/shared/config/`.** Boot fails loud if config is invalid.
6. **No cross-module DB access.** If billing needs a user, it calls `usersModule.getById()` - it does NOT query the users table.
7. **Errors are typed.** Throw a typed error (`NotFoundError`, `ValidationError`); middleware formats the response.
8. **No `any`.** `unknown` + narrowing is fine. `as` only for cases the type system can't express.

## Before you change X, read Y

- Adding a new module → `docs/modules.md`
- Adding an API endpoint → `docs/api-conventions.md`
- Changing the data layer → `docs/data-layer.md`
- Adding a background job → `docs/background-jobs.md`
- Touching auth → `docs/auth.md`
- Big architectural change → `ARCHITECTURE.md` + add an ADR to `DECISIONS.md`

## Out of scope

- Hosting an admin UI (separate frontend)
- Email templates / sending (use a transactional email service - this service only triggers)
- File processing pipelines beyond what fits in a single request (use background jobs)
- _add project-specific exclusions_

## Memory

- This file is read on every Claude session start. Keep it current.
- "We tried X, here's why we backed out" notes go in `DECISIONS.md`.
- Active work goes in `PLAN.md`.
