## Framework specifics: plain React

This project is a React widget / library / island mounted into an existing host page. No framework, no router assumed.

### Entry

- The entry component (`<App />` or named after the widget) is exported from `src/index.ts`.
- The host page mounts it via `ReactDOM.createRoot(node).render(<App />)`.
- No routing layer ships - if the widget needs internal navigation, use local state or pass route hooks in from the host.

### Build

- Bundled with Vite in library mode (`build.lib`) or with `tsup`. Pick one in `vite.config.ts` / `tsup.config.ts`.
- Output: ESM + CJS + `.d.ts` types in `dist/`.
- Peer deps: `react`, `react-dom`. Never bundle them.

### Styling in a host environment

- Tailwind classes work but **must be scoped** if the host might use Tailwind too. Options:
  1. Prefix all our classes (Tailwind config `prefix: "ao-"`).
  2. Ship a compiled CSS file with hashed class names (CSS modules).
  3. Inline styles via a CSS-in-JS solution (last resort - breaks our token-class rule).
- Token tokens defined in a `:where()` selector so they don't fight host specificity.

### Backend integration

- The widget should NOT assume a backend exists. Take API endpoints, tokens, and callbacks as **props**.
- If the widget needs to call out, take a `fetch`-shaped function as a prop (`apiFetch?: typeof fetch`) so the host can inject auth.

### Testing

- Vitest + Testing Library still apply. Test the widget in isolation - mount it with explicit props.
- Don't test the host. Provide a fixture host in `tests/__fixtures__/` if you need to test integration scenarios.

### What this template doesn't include

- A router. Add react-router-dom only if the widget truly needs internal navigation.
- A data fetching library. TanStack Query is great inside the widget but it adds peer-dep weight - consider raw `fetch` + small hooks first.
- A state library. Local state covers most widgets. Add Zustand only when state is shared across non-parent-child components.
