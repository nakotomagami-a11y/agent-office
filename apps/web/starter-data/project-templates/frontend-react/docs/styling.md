# Styling

Tailwind CSS v4. **Token classes only.** No inline styles. No raw color names. This document defines what the tokens are and how to add new ones.

## Why token classes

A token class is a semantic name (`text-fg`, `bg-bg-2`, `border-line`) that maps to a CSS custom property. Theme changes (dark mode, brand color shift, accessibility variants) happen by changing the token definition - components never change.

Raw class (`text-zinc-100`) couples the component to a specific shade. Inline style (`style={{ color: "..." }}`) couples to a literal value AND breaks dark mode. Both are banned.

## The token taxonomy

Defined in `src/styles/globals.css` via Tailwind v4's `@theme` directive:

| Token | Use for |
|---|---|
| `bg`, `bg-2`, `bg-3` | Backgrounds, from page-level (`bg`) to recessed (`bg-3`) |
| `fg`, `fg-2`, `fg-3` | Text, from primary to subtle |
| `line` | Borders, dividers |
| `acc`, `acc-hover` | Accent / brand / primary CTA |
| `danger`, `warn`, `success` | Semantic states |
| `muted` | Backgrounds for disabled / placeholder areas |

Resulting Tailwind classes: `text-fg`, `bg-bg-2`, `border-line`, `text-acc`, `bg-danger`, etc.

## Adding a new token

When the design needs a color that doesn't exist:

1. Add it to `@theme` in `globals.css`.
2. Define the dark-mode override in the same place.
3. Document it in the table above.
4. THEN use it in a component.

Never use a one-off hex value in a component. If you find yourself typing `#`, stop.

## Arbitrary values

Tailwind supports `[w-23px]`, `[animation-delay:240ms]`. Use them for:

- One-off numeric values (a specific gap, a specific shadow).
- Never for colors. Colors always use tokens.

If an arbitrary value appears in two components, make it a token or a `@layer components` class.

## Conditional classes

Use `clsx` (or an inline array `[a, b].join(" ")`) - never string concatenation.

```tsx
import clsx from "clsx";

<button
  className={clsx(
    "rounded px-3 py-2 text-fg",
    isActive && "bg-acc",
    disabled && "opacity-50",
  )}
/>
```

## Dark mode

Tokens handle this. Components don't write `dark:` variants unless they need behavior that diverges from the token system (rare).

When a `dark:` variant IS needed, scope it tightly to the element that needs it, not a whole region.

## What's banned

- `style={{ ... }}` - banned outside `node_modules/`. CSS-in-JS is not in this project's design system.
- Raw color classes: `text-red-500`, `bg-blue-900`. Always tokens.
- Tailwind `important: true` - signals a specificity battle. Fix the cascade instead.
- Custom CSS files outside `globals.css` - if you need them, write a `@layer components` block.
