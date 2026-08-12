# Authentication

JWT access + refresh tokens. `jose` for signing. Cookie transport when frontend is same-domain, `Authorization: Bearer` otherwise.

## Why JWT (and not sessions)

- Works for browser AND API AND mobile clients with one mechanism.
- Refresh token rotation gives revocation without a per-request DB lookup.
- If this service ever splits into multiple services, JWT verification is local (no central session store needed).

The trade: tokens are stateless until revoked, and revocation requires either a denylist or a refresh-token DB. We use the refresh-token DB (see below).

## Token shape

**Access token** - short-lived (15 minutes), signed with `JWT_ACCESS_SECRET`:

```json
{
  "sub": "u_abc",
  "email": "user@example.com",
  "iat": 1234567890,
  "exp": 1234568790
}
```

**Refresh token** - long-lived (30 days), signed with `JWT_REFRESH_SECRET`, **stored hashed in DB** so it can be revoked:

```json
{
  "sub": "u_abc",
  "jti": "<random-id>",
  "iat": 1234567890,
  "exp": 1237159890
}
```

`jti` (token ID) is the row key in the `refresh_tokens` table.

## Refresh rotation

On `/auth/refresh`:
1. Verify the refresh token's signature.
2. Look up `jti` in `refresh_tokens`. If revoked or missing → 401, force re-login.
3. Issue a new access token AND a new refresh token. Mark the old refresh token revoked.
4. Return both.

This means a stolen refresh token works once - the legitimate user's next refresh invalidates the attacker's chain.

## Transport: cookies vs Authorization header

Same-domain frontend (Next.js BFF, SPA on same origin):
- Access token in an `httpOnly`, `secure`, `sameSite=lax` cookie.
- Refresh token in a separate `httpOnly`, `secure`, `sameSite=strict` cookie, scoped to `/auth/refresh`.
- Frontend sends no headers - cookies attach automatically.

API-only (mobile, third-party):
- Tokens returned as JSON. Client stores them (Keychain on iOS, EncryptedSharedPreferences on Android).
- Subsequent requests send `Authorization: Bearer <access_token>`.

The auth middleware accepts both. The login endpoint accepts a `transport` param (`"cookie"` or `"bearer"`) to decide how to return.

## Implementation sketch

```ts
// src/shared/auth/jwt.ts
import { SignJWT, jwtVerify } from "jose";
import { config } from "@/shared/config";

const accessSecret = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(config.JWT_REFRESH_SECRET);

export async function signAccessToken(payload: { sub: string; email: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(accessSecret);
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, accessSecret);
  return payload as { sub: string; email: string };
}

// ... refresh token functions follow the same pattern
```

```ts
// src/shared/auth/middleware.ts
import type { MiddlewareHandler } from "hono";
import { UnauthorizedError } from "@/shared/errors";

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = extractToken(c); // cookie OR header
  if (!token) throw new UnauthorizedError("missing_token");
  const payload = await verifyAccessToken(token);
  c.set("user", payload);
  await next();
};
```

## Route examples

```ts
// src/modules/auth/routes.ts
authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const result = await authService.login(email, password);
  return setAuthCookies(c, result);
});

authRoutes.post("/refresh", async (c) => {
  const token = c.req.cookie("refresh_token") ?? extractBearer(c);
  if (!token) throw new UnauthorizedError("missing_refresh");
  const result = await authService.refresh(token);
  return setAuthCookies(c, result);
});

authRoutes.post("/logout", requireAuth, async (c) => {
  await authService.revoke(c.get("user").sub);
  return clearAuthCookies(c);
});
```

## Password hashing

`argon2` (preferred) or `bcrypt`. Argon2id, with cost tuned to ~100ms on your prod hardware.

NEVER:
- Store passwords in plaintext
- Use MD5, SHA-1, SHA-256 (unsalted, fast hashes are wrong for passwords)
- Use the same secret for access AND refresh tokens

## Authorization (vs authentication)

Authentication = who. Authorization = what they can do.

This template handles authentication. Authorization (roles, permissions) is per-project:

- Simple: a `role` field on the user. Middleware checks `if (user.role !== "admin") throw new ForbiddenError(...)`.
- Complex: a policy layer. Add a `src/shared/policy/` module with `can(user, "edit", resource)` functions. Services call it.

Don't reach for a full ABAC framework until simple checks fail to compose.

## What NOT to do

- Don't store JWTs in `localStorage`. XSS reads them. Cookies (httpOnly) or in-memory only.
- Don't put sensitive data in the JWT payload. It's base64, not encrypted.
- Don't make access tokens long-lived. 15-30 min max. Use refresh for the long tail.
- Don't skip token revocation. Refresh tokens MUST be revocable via the DB.
- Don't roll your own crypto. Use `jose`, `argon2`. Don't write a custom signing scheme.
