# Modules

The modular monolith. Each module is theoretically its own service - they run in the same process.

## Why modular monolith (not microservices)

See `docs/module-extraction.md` for the recipe when (if) the time comes. Until then: monolith with clean boundaries beats microservices on every axis that matters for solo / small-team work.

## Module structure

```
app/modules/<name>/
├── routes.py        # APIRouter - thin HTTP layer
├── service.py       # business logic
├── repository.py    # data access
├── schemas.py       # Pydantic models
├── models.py        # SQLAlchemy ORM models
├── jobs.py          # background jobs (optional)
├── events.py        # internal events (optional)
├── _internal/       # helpers used only within the module
└── __init__.py      # public API
```

## The public API rule

`__init__.py` is the ONLY file other modules may import from.

```python
# app/modules/users/__init__.py
from .service import get_by_id, create
from .schemas import User, NewUser

__all__ = ["get_by_id", "create", "User", "NewUser"]
```

Other modules:

```python
# Good
from app.modules.users import get_by_id, User

# Bad
from app.modules.users.service import get_by_id  # reaching into internals
from app.modules.users.repository import _query_user  # worse
```

Currently doc-enforced. Enforce in CI with `import-linter`:

```ini
# .importlinter
[importlinter]
root_packages = app
include_external_packages = False

[importlinter:contract:modules]
name = Modules expose only their __init__
type = forbidden
source_modules = app.modules
forbidden_modules = app.modules.*.service, app.modules.*.repository, app.modules.*.models, app.modules.*._internal
ignore_imports = app.modules.* -> app.modules.*.__init__
```

## When to add a new module

A module = bounded context. Concepts that change together, with their own consistency rules.

Examples:
- `users` - identity, sessions, profiles
- `billing` - subscriptions, invoices, ledger
- `notifications` - email, push, in-app

Not modules:
- "utils" folder (use `app/shared/`)
- A folder for a single table without behavior (premature)

When in doubt: start in an existing module. Extract when seams become obvious.

## Cross-module communication

### 1. Direct function call (default)

```python
# billing/service.py
from app.modules.users import get_by_id as get_user

async def create_invoice(session, user_id: str):
    user = await get_user(session, user_id)
    # ...
```

Simple, sync, fast.

### 2. Module event (when decoupling matters)

```python
# app/shared/events.py
from collections import defaultdict
from typing import Awaitable, Callable

_handlers: dict[str, list[Callable[..., Awaitable[None]]]] = defaultdict(list)

def on(event: str):
    def deco(fn):
        _handlers[event].append(fn)
        return fn
    return deco

async def emit(event: str, payload: dict):
    for handler in _handlers[event]:
        await handler(payload)
```

```python
# users/service.py
await emit("user.created", {"id": user.id, "email": user.email})

# notifications/__init__.py
@on("user.created")
async def send_welcome(payload):
    await send_email(payload["email"], "Welcome")
```

Use for fire-and-forget. Async handlers run sequentially (or wrap in `asyncio.gather` if independent).

### 3. Background job

For slow / retryable work. See `docs/background-jobs.md`.

## What goes in `shared/`

Cross-cutting infrastructure: config, DB engine, logger, errors, HTTP middleware.

NOT in shared:
- Domain logic (always belongs to a module)
- "utility functions" used by one module - keep them in the module's `_internal/`

## What NOT to do

- Don't share types via `_internal/`. Export from `__init__.py`.
- Don't create `shared/types.py` for cross-cutting domain types. They belong to a module.
- Don't introduce a DI container. Pydantic + FastAPI's `Depends` cover it.
- Don't make a module's models accessible to other modules. Other modules use the schemas only.
