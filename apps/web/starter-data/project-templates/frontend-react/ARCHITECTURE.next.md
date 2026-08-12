## Framework specifics: Next.js

This project uses the **App Router** (not the legacy Pages Router). All routes live in `src/app/`.

### Server vs client components

- **Default: server component.** They render on the server, can be async, can read directly from the DB or hit the backend without `useEffect`.
- **Mark `"use client"`** when you need: interactivity (`onClick`, `onChange`), state (`useState`, Zustand), or browser-only APIs (`window`, `localStorage`).
- Don't sprinkle `"use client"` at the root - push it down to leaves. A page can be a server component that renders a small client island.

Decision tree:

1. Does this component need state, effects, or DOM events? → client.
2. Does it fetch data only? → server, async function, `await` the call directly.
3. Does it pass server-fetched data to a client component? → server component owns the fetch and renders the client child with props.

### Routing conventions

- `src/app/<segment>/page.tsx` - the route's page (server component by default).
- `src/app/<segment>/layout.tsx` - persistent shell (nav, footer).
- `src/app/<segment>/loading.tsx` - suspense fallback.
- `src/app/<segment>/error.tsx` - error boundary (must be a client component).
- Route groups: `src/app/(marketing)/` - parens don't add a URL segment, used for shared layouts.
- Dynamic segments: `src/app/posts/[slug]/page.tsx` - `params` is async, `await` it.

### Server actions

- Mutations from client components use **server actions**, not API routes, when possible.
- Define the action with `"use server"` directive in a file like `src/app/<feature>/actions.ts`.
- Server actions return typed results. Call them from forms (`<form action={createPost}>`) or from `useTransition` for non-form flows.
- API routes (`src/app/api/.../route.ts`) are still useful for: webhook receivers, third-party integrations, anything called from outside this app.

### Env vars

- `process.env.X` in server components is fine. Never use a server-only env var in a client component - it'll either leak or be `undefined`.
- Client-exposed vars must be prefixed `NEXT_PUBLIC_`. They're embedded in the bundle - treat them as public.

### Backend integration (if this project has one)

- API routes in `src/app/api/` are for BFF glue ONLY - request shaping, auth-cookie forwarding, response trimming.
- **Real backend logic lives in `backend/`** (the Hono service). Frontend hits `backend/` via a typed client in `src/lib/api-client.ts`.
- Server components / server actions call the Hono backend over HTTP. Locally that's `http://localhost:8787` (or whatever port). Use an env var.

### Images

- Use `next/image` for any image. Set `width` and `height` (or use `fill` with a sized container).
- Remote images need their domain added to `next.config.mjs` `images.remotePatterns`.

### Caching

- Default fetch caching is opt-out in App Router. Use `cache: "no-store"` for live data, `next: { revalidate: N }` for ISR.
- `revalidatePath()` / `revalidateTag()` after mutations to invalidate the cache.
