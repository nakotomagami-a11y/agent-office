# Caching

Opt-in. Not wired by default. Add when measurement shows a hotspot.

## The rule

Don't add a cache until you've measured slowness. Premature caching adds:
- Invalidation bugs (the single hardest problem)
- A new infra dependency (Redis usually)
- A new failure mode (cache stampede, cache poisoning)

Profile first. If a query is fast and rarely called, don't cache it.

## When caching makes sense

- Read-heavy data with low write rate (config, feature flags, popular content)
- Expensive computation (aggregations, rendered content)
- External API calls with strict rate limits (cache the response)
- Session data accessed on every request

## Where to cache

In order from cheap to expensive:

1. **In-process memory** - `Map`, `lru-cache`. Fast, free. Doesn't survive restart, doesn't sync across instances.
2. **Redis** - shared across instances. Survives restart (with persistence). Adds infra.
3. **HTTP `Cache-Control`** - the client / CDN caches. Free, no infra, but you control invalidation only via TTL.

Pick the lowest tier that meets the need.

## Cache key conventions

Structured strings. Namespace by domain, then resource, then identifier:

```
users:profile:u_abc
billing:invoices:list:u_abc:p1
config:feature-flags:all
```

Avoid spaces, avoid colliding namespaces, version when the shape changes (`users:profile:v2:u_abc`).

## TTL

Always set one. "Forever" caches become bugs. Start at 60 seconds, adjust based on data freshness needs.

For data that changes via known events: TTL of a few minutes plus event-driven invalidation.

## Invalidation

Two strategies. Pick one per cache:

### Time-based (TTL only)

Cache for N seconds. Accept some staleness. Simple, no bugs.

Use when: stale data for a minute is fine.

### Event-based

Cache forever (or with a long safety TTL). Invalidate explicitly when the source changes:

```ts
// users/service.ts
export async function updateProfile(userId: string, patch: ProfilePatch) {
  const user = await usersRepo.update(userId, patch);
  await cache.delete(`users:profile:${userId}`);
  return user;
}
```

Use when: stale data is unacceptable AND you control all writes.

Tag-based invalidation (delete all keys with tag `user:u_abc`) is a Redis pattern when one entity touches many keys. Useful but adds complexity.

## Cache stampede

When a popular cache key expires and N requests miss simultaneously, they all hit the DB. Mitigations:

- **Probabilistic early expiration**: refresh slightly before TTL with a small chance. Spreads renewal across many requests.
- **Singleflight**: one request renews; others wait. Implementable with a lock in Redis.

Don't worry about this until traffic is high enough that the thundering herd matters.

## What NOT to do

- Don't cache mutations (POST results). Mutations should hit the source of truth.
- Don't cache user-specific data with a global key. Always namespace by user.
- Don't put complex objects in the cache - serialize to JSON, deserialize on read. Watch for date / `undefined` round-trip issues.
- Don't cache without a TTL fallback. Always have a hard expiration.
- Don't add a cache layer to make slow code fast. Fix the code first.
