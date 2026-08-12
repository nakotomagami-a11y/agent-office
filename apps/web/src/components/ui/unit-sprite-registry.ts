// Catalog + resolver for the Tiny Swords unit sprite avatars.
//
// Each sprite sheet is a horizontal strip of square frames; idle and run sheets
// live under `/units/<faction>/<kind>-<state>.png`. The `bbox` describes where
// the character actually sits inside each frame so the UnitSprite can crop the
// transparent padding away and fill the avatar with the character body.
//
// Numbers come from inspection of the original assets - the Tiny Swords pack
// (Free Pack by Pixel Frog) is the source of truth.

export const UNIT_FACTIONS = ["blue", "red", "purple", "yellow", "black"] as const;
export type UnitFaction = (typeof UNIT_FACTIONS)[number];

export const UNIT_KINDS = ["pawn", "warrior", "archer", "monk", "lancer"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

export interface UnitSelection {
  faction: UnitFaction;
  kind: UnitKind;
}

interface SheetSpec {
  frames: number;
}

interface UnitDef {
  /** Native pixel width of a single frame in the sheet. */
  frameW: number;
  /** Native pixel height of a single frame. */
  frameH: number;
  idle: SheetSpec;
  run: SheetSpec;
  /** Chopping-wood animation. Pawn-only for now; absent on other units. */
  axe?: SheetSpec;
  /** Hammer-build animation. Pawn-only; used as the "generic working"
   *  sheet when no resource (tree/rock) is co-located with the agent. */
  hammer?: SheetSpec;
  /** Mining-rock animation. Pawn-only. */
  pickaxe?: SheetSpec;
  /** Sheep-shearing / knife animation. Pawn-only; routed when an agent
   *  is co-located with a sheep decoration while working. */
  knife?: SheetSpec;
  /**
   * Character bounding box inside one frame, in native sprite pixels. We crop
   * to this region so the avatar shows the character, not the empty padding
   * the engine uses for attacks/projectiles.
   */
  bbox: { x: number; y: number; w: number; h: number };
  /** Human-readable name shown in the unit picker. */
  label: string;
  /**
   * Canvas size multiplier relative to the default AGENT_SIZE (96 px).
   * Units whose bbox is dominated by a weapon extension (e.g. the lancer's
   * spear) look tiny at 1×; boost them so the character body reads at the
   * right visual weight on the tile. All units are feet-anchored so they
   * stand on the same ground line regardless of this value. Default: 1.
   */
  sizeMultiplier?: number;
  /**
   * Native Y pixel coordinate of the ground contact point (feet) within one
   * sprite frame. When absent, falls back to `bbox.y + bbox.h`.
   * Needed for the lancer: its bbox.h = 272 extends to y=296, but the actual
   * boot contact is at y=185 (pixel-verified). The lance tip swings through
   * the remaining bbox area and must not drive the feet anchor.
   */
  groundY?: number;
}

export const UNIT_DEFS: Record<UnitKind, UnitDef> = {
  pawn: {
    frameW: 192,
    frameH: 192,
    idle: { frames: 8 },
    run: { frames: 6 },
    axe: { frames: 6 },
    hammer: { frames: 3 },
    pickaxe: { frames: 6 },
    knife: { frames: 4 },
    // Pixel-verified across every idle + run frame (native 192x192): content
    // spans y:58-134, x:65-130. The old {64,60,64,104} box left ~30px of
    // phantom padding below the real feet, so the character read smaller
    // and floated above the tile's ground line vs warrior/archer/lancer.
    bbox: { x: 65, y: 58, w: 65, h: 76 },
    label: "Pawn",
  },
  warrior: {
    frameW: 192,
    frameH: 192,
    idle: { frames: 8 },
    run: { frames: 6 },
    // Pixel-verified across every idle + run frame (native 192x192): content
    // spans y:46-136, x:53-145. The old shared {56,56,80,112} box put the top
    // 10px below the head's actual highest point, so the head clipped
    // against `overflow-hidden` on the idle sway frames.
    bbox: { x: 53, y: 46, w: 92, h: 90 },
    label: "Warrior",
  },
  archer: {
    frameW: 192,
    frameH: 192,
    idle: { frames: 6 },
    run: { frames: 4 },
    // Pixel-verified across every idle + run frame: content spans y:46-135,
    // x:56-129 — same head-clipping issue as warrior, same fix.
    bbox: { x: 56, y: 46, w: 73, h: 89 },
    label: "Archer",
  },
  monk: {
    frameW: 192,
    frameH: 192,
    idle: { frames: 6 },
    run: { frames: 4 },
    // Pixel-verified across every idle + run frame: content spans y:63-133,
    // x:55-137 — same undersized/floating issue as pawn, same fix.
    bbox: { x: 55, y: 63, w: 82, h: 70 },
    label: "Monk",
  },
  lancer: {
    frameW: 320,
    frameH: 320,
    idle: { frames: 12 },
    run: { frames: 6 },
    // bbox.x/w are pixel-verified to the character's body only (helmet to
    // boots, x:128-183 in the native 320x320 frame) so `bodyCenterX` centres
    // on the human, not the spear. bbox.h stays the old spear-inflated value
    // (272, not the body's true ~72px) so `scale` derives from it; combined
    // with sizeMultiplier below, this fills the tile at roughly the same
    // visual weight as warrior/archer instead of reading tiny and off-centre.
    bbox: { x: 128, y: 24, w: 55, h: 272 },
    label: "Lancer",
    // 2.5 read too small next to the other units (body filled ~66% of the
    // tile height vs ~80% for warrior/archer) - 3.0 matches their weight and
    // still leaves the spear tip poking over the top edge, clipped by
    // `overflow-hidden`, which is the intended look.
    sizeMultiplier: 3.0,
    groundY: 185,
  },
};

export const FACTION_LABELS: Record<UnitFaction, string> = {
  blue: "Blue",
  red: "Red",
  purple: "Purple",
  yellow: "Yellow",
  black: "Black",
};

export function isUnitFaction(value: string): value is UnitFaction {
  return (UNIT_FACTIONS as readonly string[]).includes(value);
}

export function isUnitKind(value: string): value is UnitKind {
  return (UNIT_KINDS as readonly string[]).includes(value);
}

/** Parse `"blue/pawn"` into a {@link UnitSelection}. Returns `null` if invalid. */
export function parseUnit(raw: string | null | undefined): UnitSelection | null {
  if (!raw) return null;
  const parts = raw.trim().toLowerCase().split("/");
  if (parts.length !== 2) return null;
  const [faction, kind] = parts;
  if (!faction || !kind) return null;
  if (!isUnitFaction(faction) || !isUnitKind(kind)) return null;
  return { faction, kind };
}

export function formatUnit(u: UnitSelection): string {
  return `${u.faction}/${u.kind}`;
}

export type UnitSheetState = "idle" | "run" | "axe" | "hammer" | "pickaxe" | "knife";

export function unitSheetSrc(
  faction: UnitFaction,
  kind: UnitKind,
  state: UnitSheetState,
): string {
  return `/units/${faction}/${kind}-${state}.png`;
}

export function unitForAgent(name: string, override?: string | null): UnitSelection {
  const parsed = parseUnit(override);
  if (parsed) return parsed;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return {
    faction: UNIT_FACTIONS[h % UNIT_FACTIONS.length] as UnitFaction,
    kind: UNIT_KINDS[(h >>> 8) % UNIT_KINDS.length] as UnitKind,
  };
}
