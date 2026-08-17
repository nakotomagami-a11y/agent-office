# DESIGN — Cosmic project header

## Reading this as
A **static procedural cosmic backdrop for a text-dense operational header**, in a
**pixel-art / lo-fi-astronomy** language, implemented as a hand-written WebGL2
renderer that mirrors the existing `@agent-office/pixel-planets` package so it
drops into the codebase natively.

## Dials
- `DESIGN_VARIANCE: 5` — this is a work surface, not a landing page. Calm, not chaotic.
- `MOTION_INTENSITY: 2` — the source generator is a **still** (dust/nebulae/planets
  have no time uniform; the twinkle particles freeze after 0.5s by design). We keep
  it static: render once to a canvas, cache, ~zero ongoing cost. Honors
  `prefers-reduced-motion` for free.
- `VISUAL_DENSITY: 4` — moderate; legibility of the roster/git/memory UI on top wins
  every tie.

## Direction (confirmed with user)
- **Option A**: the existing editable pixel-planet avatar stays the hero's focal
  subject, floating in its own patch of cosmos. Concept: *each project is a planet in
  its own corner of space.* The whole cosmic treatment is tuned to the planet.
- Backdrop is **bounded to the hero card** (not the full scrollable page).

## Architecture
New sibling package `@agent-office/space-background`, mirroring `pixel-planets`:
- `types.ts` — `SpaceConfig` (serialisable), `SpaceParams`, layer/scheme types.
- `schemes.ts` — the 13 deep-fold colour schemes (NYX8 default), each 9 colours
  (index 0 = void, 1–8 = pixel gradient).
- `random.ts` — mulberry32 + hashProjectId (deterministic per project id).
- `params.ts` — resolves a `SpaceConfig` → GPU-ready `SpaceParams`, and deterministic
  planet/star placements.
- `renderer/` — WebGL2 static renderer (dust + nebulae + planet shaders ported to
  `#version 300 es` with an 8-colour palette-array lookup replacing the sampler2D
  gradient) plus a 2D-canvas overlay for point-stars and cross-stars.
- `react/SpaceBackground.tsx` — renders once into a canvas, re-renders on config /
  size change via ResizeObserver. Framework-agnostic (no `use client`).

## Legibility strategy (the real design work)
The busy starfield sits under: title, active badge, two counters, description,
environment bar, git status. To keep all of it AA-legible:
1. A palette-derived **void veil** calms the noise uniformly.
2. A **directional scrim** — heavier toward the bottom (env bar / git) and left
   (title / description), lighter top-right where only counters sit.
3. The foreground planet stays fully lit (focal point); the existing
   `hero-title-shadow` utility backs the title.
4. The hero ambient tint is **derived from the chosen scheme** instead of the old
   hard-coded green, so background and content read as one system.

## Fonts
No new font imported — deliberately. The source generator uses Silkscreen (pixel
font); putting a pixel face on the title would hurt legibility and the "usable/slick"
requirement. We reuse the app's existing `--font-mono` for a small cosmic touch (a
faint seed-derived "sector" coordinate near the git strip) and keep all functional
text in the app UI font. Easy to add a pixel accent later if wanted.

## Persistence
`ProjectMeta.space?: SpaceConfig`, saved via `useUpdateProject` exactly like
`meta.planet`. Editor modal mirrors `PlanetEditorModal`.
