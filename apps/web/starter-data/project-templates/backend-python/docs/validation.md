# Validation

Pydantic v2 everywhere data crosses a trust boundary. Inside the boundary, trust the type hints.

## Where to validate

**Validate**:
- HTTP request bodies (every POST/PATCH/PUT) - FastAPI does this automatically when you type the body
- HTTP query/path params - FastAPI `Query`, `Path`, validators
- Responses from external APIs (Stripe, GitHub webhooks)
- Data read from disk or untrusted sources
- Environment variables (in `app/shared/config/`)

**Don't validate**:
- Service inputs from a router that already validated
- Repository inputs from a service (type hints are enough)
- Data read from your own DB (your migrations ARE the schema)

## Schema location

Co-locate with the module: `app/modules/users/schemas.py`.

```python
from pydantic import BaseModel, EmailStr, Field

class NewUser(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=200)

class User(BaseModel):
    id: str
    email: EmailStr
    name: str
    # No password_hash here - this is the public shape
    model_config = {"from_attributes": True}  # allow ORM model -> Pydantic conversion
```

`User` is the read shape, `NewUser` is the create shape, `UserPatch` is the partial update shape. Separate models per concern.

## In routes

```python
from fastapi import APIRouter, Depends, status
from app.modules.users import schemas, service
from app.deps import get_session

router = APIRouter()

@router.post("", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: schemas.NewUser,
    session: AsyncSession = Depends(get_session),
) -> schemas.User:
    return await service.create(session, body)
```

FastAPI validates `body` against `NewUser`. Invalid input → 422 with details. `response_model` ensures the output matches `User` (extra fields stripped).

## Pydantic v2 essentials

- `EmailStr` from `pydantic[email]` extra.
- `Field(min_length=..., max_length=..., pattern=...)` for constraints.
- `Annotated[str, Field(...)]` when you need both a type alias and constraints.
- `model_validate()` to coerce dicts to Pydantic models.
- `model_dump()` to get a dict from a model.
- `model_config = {"from_attributes": True}` to enable ORM mode (Pydantic reads attrs instead of dict keys).

## Reusable primitives

`app/shared/schemas.py`:

```python
from pydantic import BaseModel, Field

class PageInfo(BaseModel):
    cursor: str | None
    has_more: bool

CursorQuery = Annotated[str | None, Field(max_length=200)]
LimitQuery = Annotated[int, Field(ge=1, le=100)]
```

Import from there. Don't redefine.

## What NOT to do

- Don't validate the same data twice in a request flow.
- Don't put validation in services. Trust the typed inputs.
- Don't write custom `__init__` validators when `Field()` + validators cover it.
- Don't use `model_validate` without checking the result - it raises on failure.
- Don't return ORM models directly from routes. Use `response_model` so Pydantic shapes the output.
