# Authentication

JWT access + refresh tokens. `python-jose` for signing.

## Why JWT

Same rationale as the Node template: works for browser, mobile, and API; stateless verification; refresh tokens give revocability via DB.

## Token shape

**Access token** - 15 min, signed with `JWT_ACCESS_SECRET`:

```python
{"sub": "u_abc", "email": "user@example.com", "iat": 1234567890, "exp": 1234568790}
```

**Refresh token** - 30 days, signed with `JWT_REFRESH_SECRET`, stored hashed in `refresh_tokens` table:

```python
{"sub": "u_abc", "jti": "<random-id>", "iat": 1234567890, "exp": 1237159890}
```

## Refresh rotation

On `/auth/refresh`:
1. Verify signature.
2. Look up `jti` in `refresh_tokens`. Missing or revoked → 401, force re-login.
3. Issue NEW access + refresh tokens. Revoke the old refresh.
4. Return both.

Stolen refresh tokens work once - legitimate user's next refresh kills the attacker's chain.

## Implementation sketch

```python
# app/shared/auth/jwt.py
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from app.shared.config import config

def sign_access_token(sub: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=15)).timestamp()),
    }
    return jwt.encode(payload, config.JWT_ACCESS_SECRET, algorithm="HS256")

def verify_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, config.JWT_ACCESS_SECRET, algorithms=["HS256"])
    except JWTError as e:
        raise UnauthorizedError(f"invalid_token: {e}")
```

```python
# app/deps.py
from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from app.shared.auth.jwt import verify_access_token
from app.shared.errors import UnauthorizedError

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

async def get_current_user(
    request: Request,
    bearer_token: str | None = Depends(oauth2_scheme),
) -> CurrentUser:
    # Cookie first, then Authorization header
    token = request.cookies.get("access_token") or bearer_token
    if not token:
        raise UnauthorizedError("missing_token")
    payload = verify_access_token(token)
    return CurrentUser(id=payload["sub"], email=payload["email"])

async def require_auth(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    return user
```

## Routes

```python
# app/modules/auth/routes.py
@router.post("/login")
async def login(
    body: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    tokens = await auth_service.login(session, body.email, body.password)
    set_auth_cookies(response, tokens)
    return {"ok": True}

@router.post("/refresh")
async def refresh(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise UnauthorizedError("missing_refresh")
    tokens = await auth_service.refresh(session, refresh_token)
    set_auth_cookies(response, tokens)
    return {"ok": True}

@router.post("/logout")
async def logout(
    response: Response,
    user: CurrentUser = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
):
    await auth_service.revoke_all(session, user.id)
    clear_auth_cookies(response)
    return {"ok": True}
```

## Cookies vs Authorization header

Same as Node template:
- Same-domain frontend → `httpOnly`, `secure`, `sameSite=lax` cookies
- API-only → `Authorization: Bearer` header

The `get_current_user` dependency above handles both.

## Password hashing

`argon2` via `argon2-cffi`:

```bash
uv add argon2-cffi
```

```python
from argon2 import PasswordHasher
ph = PasswordHasher()

def hash_password(password: str) -> str:
    return ph.hash(password)

def verify_password(hashed: str, password: str) -> bool:
    try:
        return ph.verify(hashed, password)
    except VerifyMismatchError:
        return False
```

NEVER use bcrypt-vs-argon2 debates as a reason to delay. Pick argon2id. Move on.

## Authorization (vs authentication)

Authentication = who. Authorization = what they can do.

- Simple: a `role` field. `if user.role != "admin": raise ForbiddenError(...)`.
- Complex: a policy layer. `app/shared/policy/` with `can(user, action, resource)`.

Skip ABAC frameworks until you actually need them.

## What NOT to do

- Don't store JWTs in localStorage. Cookies (httpOnly) or in-memory.
- Don't put sensitive data in JWT payload. Base64, not encrypted.
- Don't use long-lived access tokens. 15-30 min max.
- Don't skip revocation. Refresh tokens MUST be revocable via DB.
- Don't use MD5/SHA-1/SHA-256 for passwords. Argon2.
