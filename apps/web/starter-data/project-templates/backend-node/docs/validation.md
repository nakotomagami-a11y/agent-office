# Validation

Zod everywhere data crosses a trust boundary. Inside the boundary, trust the types.

## Where to validate

**Validate**:
- HTTP request bodies (every POST/PATCH/PUT)
- HTTP query params (every GET that takes filters)
- HTTP path params (when they're not just opaque IDs)
- Responses from external APIs (Stripe, GitHub webhooks, etc.)
- Data read from disk or untrusted sources
- Environment variables (in `src/shared/config/`)

**Don't validate** (it's already been validated upstream):
- Service inputs from a route handler that already validated
- Repository inputs from a service (TS types are enough)
- Data read from your own DB (your migrations are the schema)

## Schema location

Co-locate with the module:

```
src/modules/users/schema.ts
```

Exports:

```ts
import { z } from "zod";

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
```

## In routes

```ts
import { zValidator } from "@hono/zod-validator";

app.post("/users", zValidator("json", createUserSchema), async (c) => {
  const input = c.req.valid("json"); // typed
  const user = await usersService.create(input);
  return c.json(user, 201);
});
```

Validation failure returns 400 with the Zod error details, formatted by the error middleware.

## Response validation (optional)

For high-stakes responses (public API, billing), parse the response with an output schema. Catches drift between what you think you're returning and what you actually return.

```ts
const userPublicSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
});

return c.json(userPublicSchema.parse(user));
```

This also acts as a "deny-list" filter: fields not in the schema get stripped. Useful when the DB row has fields (`passwordHash`) that should never leave the server.

## Reusable primitives

`src/shared/schemas.ts` holds primitives that show up across modules:

```ts
export const cursorSchema = z.string().min(1).max(200);
export const limitSchema = z.coerce.number().int().min(1).max(100).default(20);
export const idSchema = z.string().min(1).max(50);
```

Import from there. Don't redefine.

## Zod gotchas

- `z.string().email()` is permissive. For strict email validation, use a library or your own regex.
- `z.coerce.number()` accepts `"5"` and converts. Use for query params. **Don't** use for body JSON (the parser already handles types).
- `z.object({...}).strict()` rejects unknown fields. Use it for write endpoints where unknown fields might be typos.
- `z.discriminatedUnion()` is better than `z.union()` when there's a kind tag - clearer errors and faster.

## What NOT to do

- Don't validate the same data twice in a request flow.
- Don't put validation in services. Services trust their typed inputs.
- Don't use Zod for performance-critical inner loops. Validate once at the boundary.
- Don't write custom validation when a Zod combinator covers it.
