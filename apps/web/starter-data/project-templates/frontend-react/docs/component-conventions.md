# Component conventions

How components are named, organized, and structured.

## File naming

- Kebab-case file names: `button-group.tsx`, `user-avatar.tsx`.
- PascalCase exports: `ButtonGroup`, `UserAvatar`. File name matches the primary export.
- One component per file. Sub-components used only by the parent live in the same file (lowercase function declaration, not exported).

## Folder organization

```
src/components/
├── ui/                  # primitives - no business logic
│   ├── button.tsx
│   ├── input.tsx
│   ├── card.tsx
│   └── modal.tsx
└── <feature>/           # business composites
    ├── user-profile.tsx
    └── user-profile-form.tsx
```

`ui/` components know nothing about your domain. They're props-in, JSX-out.

`<feature>/` components know about users, posts, billing, etc. They compose `ui/` primitives.

## Props

Define a typed interface above the component:

```tsx
interface ButtonProps {
  variant?: "primary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({ variant = "primary", size = "md", disabled, children, onClick }: ButtonProps) {
  // ...
}
```

Rules:
- Required props have no default.
- Optional props get defaults at destructure time, not via `?? "x"` inside the body.
- Variant-style props use string unions, never booleans-per-variant. `variant?: "primary" | "danger"` is better than `primary?: boolean; danger?: boolean;`.
- Don't spread `...rest` props unless you're building a primitive that wraps a native element. Spreading hides the API.

## Composition

Prefer composition over configuration:

```tsx
// Yes
<Card>
  <CardHeader>...</CardHeader>
  <CardBody>...</CardBody>
</Card>

// No (config-heavy, harder to extend)
<Card header={...} body={...} footer={...} />
```

The compound-component pattern works well for primitives.

## Server components (Next.js only)

- Default to server components. Add `"use client"` only when the component needs state, effects, or browser APIs.
- Server components can be `async` and `await` data directly. No `useEffect`, no `useState`.
- When mixing: a server component passes server-fetched data as props to a client child. The client child stays focused on interactivity.

## What goes inline vs extracted

- Inline a child component if it's <20 lines and used only by the parent.
- Extract to a sibling file when it grows beyond ~50 lines OR gets reused.
- Don't preemptively extract - components in the same file are fine until they aren't.

## Split logic from markup

`.tsx` files are for JSX. Logic that isn't markup does not live in them.

| Kind of logic | Where it goes |
| --- | --- |
| Pure helpers — formatting, parsing, grouping, classification (no React) | `src/<feature>/utils/<name>.ts` (or `src/lib/<name>.ts` if cross-feature) |
| Stateful / derived logic — a `useState` + `useMemo` cluster, data wiring, mutations, effects | a hook in `src/<feature>/hooks/use-<name>.ts` |
| JSX | stays in the `.tsx` |

A component should read as: call a hook, map the result, render.

- Never declare a module-scope `function foo()` or a fat `reduce`/`filter`/`for`
  block inside a component file — extract it to a util or hook.
- If the same helper appears in two files, move it to a shared util **immediately**.
- Reuse an existing util before writing a near-duplicate. Keep a view-specific
  variant only when its output genuinely differs (and say why).

Stays inline: trivial one-off expressions, tiny event handlers
(`onClick={() => setOpen(!open)}`), and UI-only state with no derived logic.

## Imports

Use absolute imports for our code (`@/components/ui/button`). Relative imports for files in the same folder.

No barrel `index.ts` files for components. Direct imports keep refactoring easy and tree-shaking sharp.
