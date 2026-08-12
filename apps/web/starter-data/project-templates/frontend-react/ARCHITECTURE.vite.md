## Framework specifics: Vite

This project is a **SPA** built with Vite. Single HTML entry, client-side routing.

### Entry & build

- Entry: `src/main.tsx` mounts `<App />` to `#root` in `index.html`.
- Dev: `pnpm dev` - HMR on, default port 5173.
- Build: `pnpm build` - outputs to `dist/`. Static files only, deploy to any CDN.
- Type-check: `pnpm typecheck` (or `tsc --noEmit`). Vite itself doesn't type-check during build - run TS check separately.

### Routing

- **react-router v6** (or v7 declarative mode). Routes defined in `src/app/routes.tsx`.
- Layout routes wrap child routes via `<Outlet />`.
- Loaders are NOT used (data router mode adds complexity not worth it for most apps). Fetch in components via TanStack Query.

### Env vars

- Defined in `.env.local` (gitignored) and `.env` (committed defaults). Read via `import.meta.env.VITE_FOO`.
- **All env vars exposed to the client must start with `VITE_`.** No secrets - this is a static bundle.
- Server-only secrets don't apply (this is a SPA, no server).

### Backend integration (if this project has one)

- Frontend calls `backend/` over HTTP using a typed client in `src/lib/api-client.ts`.
- Configure base URL via `VITE_API_URL`. Dev default: `http://localhost:8787`.
- Auth tokens stored in httpOnly cookies (set by backend) or in-memory (refresh on reload).

### Static assets

- Files in `public/` are served as-is at root (`/logo.svg` → `public/logo.svg`).
- Imported assets (`import logo from "./logo.svg"`) get fingerprinted by Vite.

### What Vite doesn't give you

- No SSR. If you need it, switch to Next.js (this is an ADR-worthy change).
- No image optimization out of the box. Use `vite-imagetools` if it becomes a problem.
- No file-system routing. Routes are explicit in `src/app/routes.tsx`.
