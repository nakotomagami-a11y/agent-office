# pixel-planets

Procedural pixel-art planets rendered in real-time with WebGL2.

Eleven planet types — gas giant, rocky, terran, ice world, islands, lava world, dry planet, asteroid, black hole, galaxy, star — each built from 1–3 composited shader layers. Colors are fully configurable via named palettes. Animation is driven by elapsed time so planets rotate and breathe at a stable visual speed regardless of frame rate.

![Planet types: gas giant, rocky, terran, black hole, star, galaxy, asteroid](docs/preview.png)

---

## Features

- **Pure WebGL2** — no Three.js, no canvas 2D drawing, no image assets
- **One GL context for N planets** — a singleton renderer shares a single offscreen canvas; browsers cap WebGL contexts at 8–16 per page, this approach uses exactly one no matter how many planets are on screen
- **Deterministic** — same `seed` integer always produces the same planet on every device; safe to store in a database
- **Pixelated look** — shaders quantise UV coordinates to produce chunky blocky pixels; density is controlled by a `pixels` parameter
- **Optional dithering** — Bayer-style ordered dithering at light/shadow transitions creates the characteristic staircase effect
- **React component included** — `<PlanetCanvas>` is a `memo`-wrapped component with zero configuration; framework-agnostic core if you need it without React
- **Tree-shakeable** — renderer, palettes, React component, and math utilities are separate exports; bundle only what you use

---

## Installation

```bash
npm install @agent-office/pixel-planets
# or
pnpm add @agent-office/pixel-planets
```

React is an optional peer dependency — install it only if you want the `<PlanetCanvas>` component:

```bash
npm install react
```

---

## Quick start

### React

```tsx
// MyPlanet.tsx
"use client"; // Next.js only — omit for Vite / plain React
import { PlanetCanvas } from "@agent-office/pixel-planets/react";

export function MyPlanet() {
  return (
    <PlanetCanvas
      projectId="my-project"
      config={{ type: "terran", seed: 42, paletteIdx: 0 }}
      size={64}
      className="rounded-full"
    />
  );
}
```

### Vanilla (no framework)

```ts
import { getPlanetParams, PlanetRenderer } from "@agent-office/pixel-planets";

// The renderer shares one WebGL context across all registered canvases.
const renderer = new PlanetRenderer();

const canvas = document.getElementById("my-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const size = 64;

const params = getPlanetParams("my-project-id", {
  type: "gas-giant",
  seed: 12345,
  paletteIdx: 0,
});

renderer.register("my-planet", { id: "my-project-id", params, destCanvas: canvas, destCtx: ctx, size });

// When the element is removed:
renderer.unregister("my-planet");
```

---

## PlanetConfig

The only value you need to persist. Everything else is derived at render time.

```ts
interface PlanetConfig {
  /** Which planet type to render. */
  type: PlanetType;

  /**
   * Integer seed (1–999 999 999).
   * Drives all procedural choices — same seed = same planet on every device.
   */
  seed: number;

  /** Index into the type's palette array. See PLANET_TYPE_DEFS[type].palettes. */
  paletteIdx: number;

  /**
   * Logical pixel density (10–300, default 50).
   * Lower = bigger, chunkier pixels. Higher = finer detail.
   */
  pixels?: number;

  /**
   * Planet rotation in radians (0–2π).
   * Omit to derive a stable rotation from the seed.
   */
  rotation?: number;

  /**
   * Enable Bayer dithering at light/shadow borders.
   * Creates the characteristic stepping effect. Default: true.
   */
  dither?: boolean;
}
```

### Planet types

| Type | Layers | Notes |
|------|--------|-------|
| `gas-giant` | 2 gas layers | Cloud bands, spherified |
| `rocky` | rock + craters | 2-layer composite |
| `dry` | terrain | No water (`riverCutoff: 0`) |
| `terran` | terrain + cloud | River cutoff ~0.37 |
| `ice` | terrain + cloud | High river cutoff, icy palette |
| `islands` | rock + landmass + cloud | Landmass is partially transparent |
| `lava` | rock + craters + lava-rivers | Cracks glow |
| `asteroid` | asteroid | Freeform (no circle clip) |
| `black-hole` | body + ring | 3× oversize canvas for ring |
| `galaxy` | galaxy | Freeform (no circle clip) |
| `star` | blobs + main + flares | 2× oversize canvas for corona |

Freeform types (`asteroid`, `galaxy`, `star`) render outside the circular boundary by design. Don't apply CSS `border-radius: 50%` to them, or do it intentionally for a clipped look.

---

## API reference

### `getPlanetParams(projectId, config?)`

Converts a `PlanetConfig` into `PlanetParams` — the fully resolved data the renderer uploads to the GPU. If `config` is omitted, a random gas-giant or rocky planet is generated deterministically from `projectId`.

```ts
import { getPlanetParams } from "@agent-office/pixel-planets";

const params = getPlanetParams("project-abc", {
  type: "lava",
  seed: 777,
  paletteIdx: 2,
});
```

### `PlanetRenderer`

```ts
class PlanetRenderer {
  // Registers a display canvas for continuous rendering. Starts the rAF loop.
  register(key: string, reg: Registration): void;

  // Unregisters a canvas. Stops the rAF loop when no canvases remain.
  unregister(key: string): void;
}

interface Registration {
  id: string;
  params: PlanetParams;
  destCanvas: HTMLCanvasElement; // the visible <canvas> the user sees
  destCtx: CanvasRenderingContext2D;
  size: number;                  // display size in CSS pixels
}
```

The renderer is a regular class — instantiate one per application. The `<PlanetCanvas>` React component creates a module-level singleton automatically.

### `randomPlanet()` / `randomPlanetOfType(type)`

Generate a random `PlanetConfig` using `Math.random()`. Not seeded — use these for "Randomize" buttons, not for deterministic generation.

```ts
import { randomPlanet, randomPlanetOfType } from "@agent-office/pixel-planets";

const config = randomPlanet();               // random type + seed + palette
const rocky  = randomPlanetOfType("rocky");  // fixed type, random seed + palette
```

### `PLANET_TYPE_DEFS`

A map from every `PlanetType` to its `{ label, palettes[] }` definition. Use this to build type/palette picker UIs.

```ts
import { PLANET_TYPE_DEFS } from "@agent-office/pixel-planets";

const def = PLANET_TYPE_DEFS["terran"];
console.log(def.label);             // "Terran"
console.log(def.palettes[0].name);  // "Default"
```

### `FREEFORM_TYPES`

A `Set<PlanetType>` of types that render outside the circular boundary (`asteroid`, `galaxy`, `star`). Use it to conditionally apply or skip CSS `border-radius`.

```ts
import { FREEFORM_TYPES } from "@agent-office/pixel-planets";

const className = FREEFORM_TYPES.has(config.type) ? "" : "rounded-full overflow-hidden";
```

---

## React component

```tsx
import { PlanetCanvas } from "@agent-office/pixel-planets/react";

<PlanetCanvas
  projectId="project-id"  // stable ID for deterministic fallback planet
  config={planetConfig}   // optional — omit for auto-generated planet
  size={64}               // display size in px (default 32)
  className="..."         // forwarded to <canvas>
/>
```

The component uses `memo` for shallow-prop comparison. Only pass a new `config` object when the planet actually changes — prefer memoising the config object with `useMemo` if it's computed inline.

---

## Architecture

```
packages/pixel-planets/
├── src/
│   ├── types.ts           PlanetType, PlanetConfig, PlanetParams, PlanetLayer, ShaderName
│   ├── math.ts            Mulberry32 PRNG, cosine palette scheme, RGB helpers
│   ├── params.ts          LAYER_TEMPLATES, FREEFORM_TYPES, getPlanetParams()
│   ├── random.ts          randomPlanet(), randomPlanetOfType()
│   ├── index.ts           Public barrel (this is "@agent-office/pixel-planets")
│   ├── palettes/
│   │   ├── types.ts       PaletteDef, PlanetTypeDef
│   │   ├── index.ts       PLANET_TYPE_DEFS
│   │   ├── gas-giant.ts
│   │   ├── rocky.ts
│   │   └── ...            (one file per planet type)
│   ├── renderer/
│   │   ├── index.ts       PlanetRenderer class
│   │   ├── uniforms.ts    setUniform / setUniformInt helpers
│   │   └── shaders/
│   │       ├── index.ts   FRAG_SHADERS map + VERT_SRC re-export
│   │       ├── vert.ts    Shared vertex shader (full-screen quad)
│   │       ├── gas.ts
│   │       ├── rock.ts
│   │       └── ...        (one file per fragment shader)
│   └── react/
│       ├── PlanetCanvas.tsx  memo-wrapped React component
│       └── index.ts          "@agent-office/pixel-planets/react"
└── README.md
```

### How the singleton renderer works

One hidden `<canvas>` element holds the WebGL2 context. On every animation frame, the renderer iterates over all *registered* display canvases, resizes the offscreen canvas to each planet's render size, runs the shader programs, then copies the result to the display canvas with `drawImage`. The display canvas is a plain 2D canvas — it never touches WebGL directly.

This means `N` planets on screen = `1` GL context + `N` 2D canvases + `N` `drawImage` calls per frame.

### Why `premultipliedAlpha: false`

The fragment shaders write straight-alpha RGBA: `vec4(col.rgb, 0.0)` for fully transparent pixels, `vec4(col.rgb, 1.0)` for opaque ones. With `premultipliedAlpha: true` (the browser default), a pixel like `(1,0,0, 0)` is mathematically invalid as a premultiplied value, so some browsers clamp it to `(1,1,1, 0)` (white) or display it as opaque. Setting `premultipliedAlpha: false` tells the browser our framebuffer uses straight-alpha, making `alpha=0` pixels correctly transparent regardless of RGB values.

### Shader pipeline

All 13 fragment shaders share:
- The same vertex shader (full-screen quad, UV [0,1]² with Y-flip)
- The same VAO / VBO / IBO bound to `a_pos` and `a_uv` attributes
- A common set of uniforms (`pixels`, `rotation`, `seed`, `time`, `colors`, `size`, `OCTAVES`)

Each shader receives additional uniforms specific to its algorithm (e.g. `cloud_cover` for gas layers, `river_cutoff` for terrain/lava, `uv_offset`/`uv_scale` for star and black-hole body shaders that render in a sub-region of an oversized canvas).

---

## Development

```bash
# From the monorepo root
pnpm install
pnpm -F @agent-office/pixel-planets typecheck
```

To add a new planet type:

1. Create `src/palettes/<type>.ts` with a default-export `PaletteDef[]`
2. Register it in `src/palettes/index.ts`
3. Add the type string to `PlanetType` in `src/types.ts`
4. Add a `LAYER_TEMPLATES` entry in `src/params.ts` (and a fallback case in `getFallbackLayers`)
5. Write the fragment shader in `src/renderer/shaders/<type>.ts` and register it in `src/renderer/shaders/index.ts`
6. Add the `drawLayer` switch case in `src/renderer/index.ts`

---

## Credits

The shader algorithms are a WebGL2 port of the [Pixel Planet Generator](https://deep-fold.itch.io/pixel-planet-generator) by [Deep-Fold](https://deep-fold.itch.io/), originally written in Godot / GLSL ES. The original project is MIT-licensed and open-source. This package translates those shaders to standalone TypeScript + WebGL2 with no engine dependency.

---

## License

MIT
