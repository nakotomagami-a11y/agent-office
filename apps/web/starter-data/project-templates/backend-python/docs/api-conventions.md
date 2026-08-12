# API conventions

REST-shaped HTTP. JSON in, JSON out. FastAPI generates OpenAPI from the Pydantic models for free.

## Resource URLs

- Plural nouns: `/users`, not `/user`.
- Nested only one level deep: `/users/{id}/sessions`.
- IDs are opaque strings.
- Lowercase, kebab-case for multi-word: `/saved-prompts`.

## Methods

Standard REST verbs. Same as the Node template.

## Response shapes

Success - the resource directly:

```json
{ "id": "u_abc", "name": "Alice", "email": "a@example.com" }
```

Define the response model:

```python
class UserPublic(BaseModel):
    id: str
    email: str
    name: str

@router.get("/{user_id}", response_model=UserPublic)
async def get_user(...): ...
```

`response_model` filters fields - `password_hash` won't leak even if the service returns it.

Lists - paginated:

```python
class UsersPage(BaseModel):
    items: list[UserPublic]
    page: PageInfo

class PageInfo(BaseModel):
    cursor: str | None
    has_more: bool
```

Errors - envelope (see ARCHITECTURE.md error model):

```json
{ "error": { "code": "NOT_FOUND", "message": "user u_abc not found", "details": null } }
```

## Pagination

Cursor-based, not offset.

```python
@router.get("", response_model=UsersPage)
async def list_users(
    cursor: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
): ...
```

## Idempotency

POST mutations accept `Idempotency-Key` header:

```python
@router.post("", response_model=Payment, status_code=201)
async def create_payment(
    body: NewPayment,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    session: AsyncSession = Depends(get_session),
):
    return await payments_service.create(session, body, idempotency_key)
```

The service checks an `idempotency_keys` table (15-min TTL), replays on hit.

## Status codes

Same matrix as the Node template (200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500, 503).

FastAPI: raise `HTTPException(status_code=409, detail="...")` for ad-hoc cases. For domain errors, raise an `AppError` subclass and let the handler set the status.

## Versioning

URL prefix when an external consumer locks in: `/v1/users`. Don't add `/v1/` preemptively.

## What NOT to do

- Don't return `{"success": True, "data": ...}` envelopes for success.
- Don't use `200` for errors with `success: False`. Use HTTP status codes.
- Don't put auth tokens in URLs.
- Don't return SQLAlchemy ORM models from routes - use Pydantic response models.
