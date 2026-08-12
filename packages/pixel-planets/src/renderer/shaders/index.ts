/**
 * Aggregates all GLSL shader source strings into one map.
 * The renderer uses this to compile programs keyed by ShaderName.
 */
import type { ShaderName } from "../../types";

import { VERT_SRC }            from "./vert";
import { GAS_FRAG_SRC }        from "./gas";
import { GAS_RING_FRAG_SRC }   from "./gas-ring";
import { ROCK_FRAG_SRC }       from "./rock";
import { CRATERS_FRAG_SRC }    from "./craters";
import { TERRAIN_FRAG_SRC }    from "./terrain";
import { LANDMASS_FRAG_SRC }   from "./landmass";
import { LAVA_RIVERS_FRAG_SRC }from "./lava-rivers";
import { ASTEROID_FRAG_SRC }   from "./asteroid";
import { BH_BODY_FRAG_SRC }    from "./black-hole-body";
import { BH_RING_FRAG_SRC }    from "./black-hole-ring";
import { GALAXY_FRAG_SRC }     from "./galaxy";
import { STAR_BLOBS_FRAG_SRC } from "./star-blobs";
import { STAR_MAIN_FRAG_SRC }  from "./star-main";
import { STAR_FLARES_FRAG_SRC }from "./star-flares";

export { VERT_SRC };

/** Map from ShaderName to compiled fragment shader source. */
export const FRAG_SHADERS: Record<ShaderName, string> = {
  "gas":              GAS_FRAG_SRC,
  "gas-ring":         GAS_RING_FRAG_SRC,
  "rock":             ROCK_FRAG_SRC,
  "craters":          CRATERS_FRAG_SRC,
  "terrain":          TERRAIN_FRAG_SRC,
  "landmass":         LANDMASS_FRAG_SRC,
  "lava-rivers":      LAVA_RIVERS_FRAG_SRC,
  "asteroid":         ASTEROID_FRAG_SRC,
  "black-hole-body":  BH_BODY_FRAG_SRC,
  "black-hole-ring":  BH_RING_FRAG_SRC,
  "galaxy":           GALAXY_FRAG_SRC,
  "star-blobs":       STAR_BLOBS_FRAG_SRC,
  "star-main":        STAR_MAIN_FRAG_SRC,
  "star-flares":      STAR_FLARES_FRAG_SRC,
};
