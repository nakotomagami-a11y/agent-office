# API conventions

REST-shaped HTTP. JSON in, JSON out.

## Resource URLs

- Plural nouns: `/users`, not `/user`.
- Nested only one level deep: `/users/:id/sessions`. Beyond that, surface as a top-level resource with filters.
- IDs in the URL are opaque strings (UUIDs, nanoids). Never auto-increment IDs in URLs.
- Lowercase, kebab-case for multi-word segments: `/saved-prompts`, not `/savedPrompts`.

## Methods

- `GET` - read. Idempotent. No side effects.
- `POST /resource` - create. Body is the new resource.
- `POST /resource/:id/action` - non-CRUD verb. Use sparingly; usually a sign you have a missing noun.
- `PATCH` - partial update. Body contains only changed fields.
- `PUT` - full replace. Rarely used in practice.
- `DELETE` - remove. Idempotent (404 on second call is fine).

## Response shapes

Success - the resource directly, no envelope:

```json
{ "id": "u_abc", "name": "Alice", "email": "a@example.com" }
```

Lists - paginated:

```json
{
  "items": [...],
  "page": { "cursor": "next_cursor", "hasMore": true }
}
```

Errors - envelope:

```json
{ "error": { "code": "NOT_FOUND", "message": "user u_abc not found", "details": null } }
```

`code` is a stable string (consumers branch on it). `message` is human-readable. `details` is optional, structured.

## Pagination

Cursor-based, not offset. Offset pagination drifts when items are added/removed.

- Request: `GET /users?cursor=<opaque>&limit=20`
- Response: `{ items, page: { cursor, hasMore } }`
- `cursor` is opaque - encode whatever lets the server resume (typically `(created_at, id)`).
- Default `limit`: 20. Max: 100.

## Filtering

Query params for filters: `GET /users?role=admin&active=true`. Validate with Zod (`z.coerce.boolean()` for query params).

For complex search, accept a `q` param or a structured filter as JSON in the body of a `POST /<resource>/search`.

## Idempotency

Any POST that creates a resource, charges money, or sends a message accepts an `Idempotency-Key` header:

```
POST /payments
Idempotency-Key: 7f4e3b2a-...
```

The idempotency middleware:
1. Hashes (route, method, key, request body).
2. Looks up the hash in the `idempotency_keys` table.
3. On hit: returns the cached response (same status, same body). No business logic runs.
4. On miss: runs the handler, caches the response (15-minute TTL), returns it.

Critical for webhooks (Stripe, GitHub, etc.) which retry on network blips.

## Status codes

| Code | Use |
|---|---|
| 200 | Success with body |
| 201 | Created (POST that created a resource) |
| 204 | Success, no body (DELETE) |
| 400 | Client error - validation, malformed body |
| 401 | Not authenticated |
| 403 | Authenticated but not authorized |
| 404 | Resource doesn't exist |
| 409 | Conflict (duplicate key, version mismatch) |
| 422 | Semantically invalid (e.g. transfer amount > balance) |
| 429 | Rate limited |
| 500 | Server bug |
| 503 | Dependency down (DB, Redis) |

Map exceptions to codes in the error middleware. Don't return raw HTTP codes from routes.

## Versioning

URL prefix when needed: `/v1/users`. Don't add `/v1/` until you have an external API consumer.

When you DO version: add `/v2/users` alongside `/v1/`, deprecate `/v1/` with a `Sunset` response header pointing at a date.

## What NOT to do

- Don't return `{ success: true, data: { ... } }` envelopes for successful reads. Returns the resource directly.
- Don't use `200` for errors and put `success: false` in the body. Use HTTP status codes.
- Don't accept both query params and body for the same field. Pick one.
- Don't put auth tokens in URLs (`?token=...`) - they end up in logs.
