# Data layer

SQLAlchemy 2.0 (async) + libSQL via `sqlalchemy-libsql` dialect.

## Connection string

- **Local dev**: `DATABASE_URL=sqlite+libsql:///./local.db` - a SQLite file. No auth token.
- **In-memory** (tests): `DATABASE_URL=sqlite+libsql:///:memory:` - per-process.
- **Prod (Turso Cloud)**: `DATABASE_URL=sqlite+libsql://<your-db>.turso.io?secure=true` + `DATABASE_AUTH_TOKEN=<token>`.

Note: SQLAlchemy URL scheme is `sqlite+libsql://`, NOT `libsql://` (the latter is the raw libSQL client). The `sqlalchemy-libsql` package registers the dialect.

## Install

```bash
uv add sqlalchemy "sqlalchemy-libsql" "libsql" "alembic"
```

## Engine setup

```python
# app/shared/db/engine.py
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.shared.config import config

# Note: libSQL via sqlalchemy-libsql currently uses a sync driver under the hood.
# If true async is needed, check sqlalchemy-libsql docs for current async support
# and switch to aiosqlite-libsql variant when available.
engine = create_async_engine(
    config.DATABASE_URL,
    connect_args={"auth_token": config.DATABASE_AUTH_TOKEN} if config.DATABASE_AUTH_TOKEN else {},
    echo=config.NODE_ENV == "development",
)

async_session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
```

If async libSQL is not yet available, drop to sync SQLAlchemy + run-in-threadpool from FastAPI. Document this in `DECISIONS.md` as the current trade-off.

## Models

SQLAlchemy 2.0 declarative style with `Mapped`:

```python
# app/modules/users/models.py
from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, DeclarativeBase

class Base(DeclarativeBase):
    pass

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    password_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

`Base` lives once in `app/shared/db/base.py`. All modules use the same Base so Alembic sees all tables.

## Repository pattern

```python
# app/modules/users/repository.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .models import User as UserModel
from .schemas import User, NewUser

async def get_by_id(session: AsyncSession, user_id: str) -> User | None:
    result = await session.execute(select(UserModel).where(UserModel.id == user_id))
    row = result.scalar_one_or_none()
    return User.model_validate(row, from_attributes=True) if row else None

async def create(session: AsyncSession, data: NewUser) -> User:
    row = UserModel(id=data.id, email=data.email, name=data.name, password_hash=data.password_hash)
    session.add(row)
    await session.flush()
    return User.model_validate(row, from_attributes=True)
```

Returning Pydantic models (not ORM instances) keeps callers decoupled from SQLAlchemy.

## Migrations - Alembic

```bash
# initial setup
uv run alembic init alembic

# generate from model diff
uv run alembic revision --autogenerate -m "add users"

# apply
uv run alembic upgrade head

# rollback last
uv run alembic downgrade -1
```

Configure `alembic/env.py` to import all module Bases:

```python
from app.modules.users.models import Base as UsersBase
# ... import each module's Base
target_metadata = UsersBase.metadata  # all share the same Base instance
```

Rules:
- One logical change per migration.
- Additive when possible.
- Test against fresh DB AND against a copy of prod.

## Transactions

Open at the service layer:

```python
# app/modules/billing/service.py
async def transfer_credits(session: AsyncSession, from_id: str, to_id: str, amount: int):
    async with session.begin():
        await users_repo.debit(session, from_id, amount)
        await users_repo.credit(session, to_id, amount)
        await ledger_repo.record(session, from_id, to_id, amount)
```

Repository methods take `session` and never open transactions themselves.

## Cross-module access

Forbidden via repository. Other modules call `users.get_by_id()` from `app.modules.users` (the `__init__.py` export).

## What NOT to do

- Don't use raw SQL strings. SQLAlchemy's expression language is type-safe.
- Don't put queries in route handlers. Routers call services.
- Don't return ORM models from routes - use Pydantic response models (FastAPI serializes).
- Don't add SQLModel. SQLAlchemy 2.0 + Pydantic is the choice (ADR-worthy to change).
- Don't query across modules. Compose at the service layer.
