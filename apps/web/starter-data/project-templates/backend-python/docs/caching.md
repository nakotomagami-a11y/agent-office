# Caching

Opt-in. Not wired by default. Add when measurement shows a hotspot.

## The rule

Don't cache until you've measured. Premature caching adds: invalidation bugs, new infra dependency, new failure modes (stampede, poisoning).

## When caching makes sense

- Read-heavy, low-write data (config, feature flags)
- Expensive computation (aggregations)
- External API calls with rate limits
- Session data accessed on every request

## Where to cache

1. **In-process** - `functools.lru_cache` or a custom dict. Free, fast. No restart persistence, no cross-instance sync.
2. **Redis** - `redis.asyncio.Redis`. Shared, persistent, adds infra.
3. **HTTP `Cache-Control`** - client / CDN cache.

Pick the lowest tier that meets the need.

## Cache key conventions

```
users:profile:u_abc
billing:invoices:list:u_abc:p1
config:feature-flags:all
```

Namespaced, versioned when shape changes.

## TTL

Always set one. Start at 60 seconds, adjust based on freshness needs.

## Invalidation

### Time-based (TTL only)

Cache for N seconds. Accept staleness. Simple.

### Event-based

```python
async def update_profile(session, user_id: str, patch: ProfilePatch):
    user = await users_repo.update(session, user_id, patch)
    await cache.delete(f"users:profile:{user_id}")
    return user
```

Use when stale is unacceptable AND you control all writes.

## Redis client

```python
from redis.asyncio import Redis
from app.shared.config import config

redis_client = Redis.from_url(config.REDIS_URL, decode_responses=True)

async def cache_get(key: str) -> str | None:
    return await redis_client.get(key)

async def cache_set(key: str, value: str, ttl: int = 60) -> None:
    await redis_client.setex(key, ttl, value)

async def cache_delete(key: str) -> None:
    await redis_client.delete(key)
```

For complex values: JSON serialize.

## Cache stampede

When a hot key expires, N requests miss simultaneously and all hit the DB. Mitigations:

- Probabilistic early refresh (refresh before TTL with small probability)
- Singleflight via Redis lock (`SET NX PX`)

Don't worry about this until traffic is high enough that it matters.

## What NOT to do

- Don't cache mutations.
- Don't cache user-specific data with global keys.
- Don't cache without a TTL fallback.
- Don't add a cache to make slow code fast. Fix the code.
