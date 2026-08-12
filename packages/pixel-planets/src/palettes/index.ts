/**
 * Assembles per-type palette definitions into one `PLANET_TYPE_DEFS` map.
 *
 * Each planet type gets:
 *   - `label`    — human-readable name shown in editor UIs
 *   - `palettes` — ordered list of named color palettes
 *
 * To add a new type:
 *   1. Create `<type-name>.ts` in this directory following the pattern above.
 *   2. Import it here and add an entry to PLANET_TYPE_DEFS.
 *   3. Add the type string to PlanetType in `../types.ts`.
 *   4. Add a LAYER_TEMPLATES entry in `../params.ts`.
 *   5. Write (or port) the fragment shader in `../renderer/shaders/`.
 */
import type { PlanetType } from "../types";
import type { PlanetTypeDef } from "./types";

import gasGiantPalettes  from "./gas-giant";
import rockyPalettes     from "./rocky";
import dryPalettes       from "./dry";
import terranPalettes    from "./terran";
import icePalettes       from "./ice";
import islandsPalettes   from "./islands";
import lavaPalettes      from "./lava";
import asteroidPalettes  from "./asteroid";
import blackHolePalettes from "./black-hole";
import galaxyPalettes    from "./galaxy";
import starPalettes      from "./star";

export const PLANET_TYPE_DEFS: Record<PlanetType, PlanetTypeDef> = {
  "gas-giant":  { label: "Gas Giant",   palettes: gasGiantPalettes  },
  "rocky":      { label: "Rocky",        palettes: rockyPalettes     },
  "dry":        { label: "Dry Planet",   palettes: dryPalettes       },
  "terran":     { label: "Terran",       palettes: terranPalettes    },
  "ice":        { label: "Ice World",    palettes: icePalettes       },
  "islands":    { label: "Islands",      palettes: islandsPalettes   },
  "lava":       { label: "Lava World",   palettes: lavaPalettes      },
  "asteroid":   { label: "Asteroid",     palettes: asteroidPalettes  },
  "black-hole": { label: "Black Hole",   palettes: blackHolePalettes },
  "galaxy":     { label: "Galaxy",       palettes: galaxyPalettes    },
  "star":       { label: "Star",         palettes: starPalettes      },
};

export type { PlanetTypeDef, PaletteDef } from "./types";
