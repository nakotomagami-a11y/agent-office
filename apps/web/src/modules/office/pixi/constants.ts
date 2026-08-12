// Shared constants for the PixiJS office renderer.
import { TILE } from "../components/office-map";

export const FOAM_SHEET = "/tiles/water-foam.png";
export const FOAM_FRAME = TILE * 3; // 192px
export const FOAM_FRAMES = 16;
// Animation speed in PixiJS "frames per ticker frame" (ticker runs at ~60fps).
// CSS: `1.6s steps(16)` = 10fps → 10/60
export const FOAM_ANIM_SPEED = 10 / 60;

// Agent sprite constants
export const AGENT_SIZE = 96;
export const UNIT_ANIM_SPEED = 8 / 60; // 8 fps at ~60fps ticker

// Path tiles are procedurally generated per material — see pixi/path/*.

// Bridge cap auto-render sources
export const BRIDGE_CAP_SRCS = {
  h_l: "/decorations/bridge-h-l.png",
  h_r: "/decorations/bridge-h-r.png",
  v_t: "/decorations/bridge-v-t.png",
  v_b: "/decorations/bridge-v-b.png",
} as const;
