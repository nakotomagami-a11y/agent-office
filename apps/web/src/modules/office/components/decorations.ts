/**
 * Decoration catalog for the office scene. Each entry defines:
 *   - which terrain it can be placed on (land = grass cell, water = empty)
 *   - the source sprite sheet
 *   - native frame size (one frame of the sheet)
 *   - frame count (1 = static, >1 = uses an animation class)
 *   - CSS class that drives the per-frame animation
 *   - which category it lives in (used by the build toolbar to group
 *     buttons; doesn't affect placement)
 *
 * Decorations render at native frame size, anchored at the BOTTOM-CENTRE
 * of their grid cell. Tall sprites (trees, houses, towers) extend upward
 * into adjacent cells visually but only occupy the one cell logically.
 *
 * Adding a new decoration: drop the PNG in /apps/web/public/decorations/,
 * add an entry below, and (if it animates) a matching .deco-NAME class
 * in globals.css. The toolbar picks it up automatically from
 * DECORATION_KINDS.
 */

import type { PathMaterialId } from "../pixi/path/materials";

export type Terrain = "land" | "water";
export type DecoCategory = "land" | "buildings" | "water" | "paths" | "animals" | "levels";

/**
 * Logical group a decoration belongs to. Each cell may hold at most one
 * decoration per family - so 4 bush variants share family "bush", and
 * placing bush2 on a cell that already has bush1 replaces it.
 * Different-family decorations stack freely (bush + tree + rock all in
 * the same cell is fine).
 */
export type DecoFamily =
  | "bush"
  | "rock"
  | "tree"
  | "stump"
  | "house"
  | "tower"
  | "castle"
  | "archery"
  | "barracks"
  | "monastery"
  | "water_rock"
  | "duck"
  | "butterfly"
  | "mushroom"
  | "shrub"
  | "pumpkin"
  | "bones"
  | "sign"
  | "grave"
  | "scarecrow"
  | "sheep"
  | "gold_mine"
  | "cursed_chest"
  | "bridge"
  | "floor"
  | "path";

export type DecorationKind =
  | "bush"
  | "bush2"
  | "bush3"
  | "bush4"
  | "rock"
  | "rock2"
  | "rock3"
  | "rock4"
  | "stump1"
  | "stump2"
  | "stump3"
  | "stump4"
  | "tree"
  | "tree2"
  | "tree3"
  | "tree4"
  | "house"
  | "house_knight"
  | "house_goblin"
  | "tower"
  | "castle"
  | "archery"
  | "barracks"
  | "monastery"
  | "water_rock"
  | "water_rock2"
  | "water_rock3"
  | "water_rock4"
  | "duck"
  | "mushroom1"
  | "mushroom2"
  | "mushroom3"
  | "shrub1"
  | "shrub2"
  | "shrub3"
  | "shrub4"
  | "shrub5"
  | "pumpkin1"
  | "pumpkin2"
  | "bones1"
  | "bones2"
  | "bone_sign"
  | "gravestone"
  | "scarecrow"
  | "sheep"
  | "gold_mine_active"
  | "gold_mine_inactive"
  | "gold_mine_destroyed"
  | "cursed_chest"
  | "bridge_h"
  | "bridge_v"
  | "butterfly"
  | "floor"
  | "path"
  | "path_stone"
  | "path_sand"
  | "path_gravel";

export interface DecorationDef {
  label: string;
  src: string;
  frameW: number;
  frameH: number;
  frames: number;
  terrain: Terrain;
  category: DecoCategory;
  /** Placement uniqueness key - at most one decoration of each family
   *  may occupy a cell. Variants of the same kind (bush1..bush4) share
   *  a family so e.g. bush2 replaces bush1 at the same cell rather than
   *  stacking two bushes. */
  family: DecoFamily;
  /** For `path`-family kinds: which procedural material to render. */
  pathMaterial?: PathMaterialId;
  animClass?: string;
  /** How the sprite is positioned inside its owning cell.
   *
   *   - "bottom" (default): the sprite's bottom-centre aligns with the
   *     cell's bottom-centre. Tall sprites (trees, houses, towers) hang
   *     upward from the cell - they look rooted to the ground.
   *   - "center": the sprite's centre aligns with the cell's centre.
   *     Used for free-standing creatures (sheep) so they read as
   *     standing on the tile rather than hanging from its top edge.
   */
  anchor?: "bottom" | "center";
  /** For 2D tilesheets (not horizontal strips): total sheet pixel width. */
  sheetW?: number;
  /** For 2D tilesheets: total sheet pixel height. */
  sheetH?: number;
  /** Preview tile column index within a 2D tilesheet. */
  previewCol?: number;
  /** Preview tile row index within a 2D tilesheet. */
  previewRow?: number;
  /** Shown in the build palette but greyed out and unselectable. Used for
   *  assets that aren't style-matched/finished yet. */
  locked?: boolean;
  /** Alternate sprites for discrete rotation. Index = DecoInstance.rot (0/1/2);
   *  index 0 should equal `src`. Enables the free-hand rotate control. */
  rotFrames?: string[];
  /** When true, the building has faction-colour variants. Blue is the base
   *  sprite (`src`/`rotFrames`); other colours resolve to `<name>_<color>.png`
   *  via {@link decoSrc}. Enables the colour swatches in the select menu. */
  colorable?: boolean;
  /** Restricts which faction colours a `colorable` building offers. Omitted =
   *  all of BUILDING_COLORS (blue/red/purple/yellow/black). Use when the pack
   *  only ships a subset (e.g. Knights House has no black). */
  colors?: BuildingColor[];
}

export const DECORATIONS: Record<DecorationKind, DecorationDef> = {
  // ─ Bushes (8 frames × 128×128, animated pulse) ──────────────────────
  bush: {
    label: "Bush 1",
    src: "/decorations/bush.png",
    frameW: 128, frameH: 128, frames: 8,
    terrain: "land", category: "land", family: "bush", animClass: "animate-[deco-bush_1.6s_steps(8)_infinite]",
  },
  bush2: {
    label: "Bush 2",
    src: "/decorations/bush2.png",
    frameW: 128, frameH: 128, frames: 8,
    terrain: "land", category: "land", family: "bush", animClass: "animate-[deco-bush_1.6s_steps(8)_infinite]",
  },
  bush3: {
    label: "Bush 3",
    src: "/decorations/bush3.png",
    frameW: 128, frameH: 128, frames: 8,
    terrain: "land", category: "land", family: "bush", animClass: "animate-[deco-bush_1.6s_steps(8)_infinite]",
  },
  bush4: {
    label: "Bush 4",
    src: "/decorations/bush4.png",
    frameW: 128, frameH: 128, frames: 8,
    terrain: "land", category: "land", family: "bush", animClass: "animate-[deco-bush_1.6s_steps(8)_infinite]",
  },

  // ─ Rocks (static, 64×64) - overlays, coexist with anything ─────────
  rock: {
    label: "Rock 1",
    src: "/decorations/rock.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "rock",
  },
  rock2: {
    label: "Rock 2",
    src: "/decorations/rock2.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "rock",
  },
  rock3: {
    label: "Rock 3",
    src: "/decorations/rock3.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "rock",
  },
  rock4: {
    label: "Rock 4",
    src: "/decorations/rock4.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "rock",
  },

  // ─ Stumps (static, 192×256) ─────────────────────────────────────────
  stump1: {
    label: "Stump 1",
    src: "/decorations/stump1.png",
    frameW: 192, frameH: 256, frames: 1,
    terrain: "land", category: "land", family: "stump",
  },
  stump2: {
    label: "Stump 2",
    src: "/decorations/stump2.png",
    frameW: 192, frameH: 256, frames: 1,
    terrain: "land", category: "land", family: "stump",
  },
  stump3: {
    label: "Stump 3",
    src: "/decorations/stump3.png",
    frameW: 192, frameH: 256, frames: 1,
    terrain: "land", category: "land", family: "stump",
  },
  stump4: {
    label: "Stump 4",
    src: "/decorations/stump4.png",
    frameW: 192, frameH: 256, frames: 1,
    terrain: "land", category: "land", family: "stump",
  },

  // ─ Trees (8 frames, animated sway). Tree1/Tree2 are taller (192×256
  //   per frame); Tree3/Tree4 are shorter (192×192). All share the
  //   .deco-tree keyframe - same 8-frame stride at 192 wide each. ─────
  tree: {
    label: "Tree 1",
    src: "/decorations/tree.png",
    frameW: 192, frameH: 256, frames: 8,
    terrain: "land", category: "land", family: "tree", animClass: "animate-[deco-tree_2.4s_steps(8)_infinite]",
  },
  tree2: {
    label: "Tree 2",
    src: "/decorations/tree2.png",
    frameW: 192, frameH: 256, frames: 8,
    terrain: "land", category: "land", family: "tree", animClass: "animate-[deco-tree_2.4s_steps(8)_infinite]",
  },
  tree3: {
    label: "Tree 3",
    src: "/decorations/tree3.png",
    frameW: 192, frameH: 192, frames: 8,
    terrain: "land", category: "land", family: "tree", animClass: "animate-[deco-tree_2.4s_steps(8)_infinite]",
  },
  tree4: {
    label: "Tree 4",
    src: "/decorations/tree4.png",
    frameW: 192, frameH: 192, frames: 8,
    terrain: "land", category: "land", family: "tree", animClass: "animate-[deco-tree_2.4s_steps(8)_infinite]",
  },

  // ─ Buildings (static). Houses are 128×192; tower 128×256; castle
  //   320×256 (footprint of a small fortress). All anchor at the
  //   bottom-centre of a single cell - tall buildings extend upward. ──
  // House 1-3 are the same building at 3 angles — merged into one rotatable
  // "house". rot (0/1/2) picks the frame; the free-hand tool rotates + mirrors.
  house: {
    label: "House",
    src: "/decorations/house1.png",
    frameW: 128, frameH: 192, frames: 1,
    terrain: "land", category: "buildings", family: "house", colorable: true,
    rotFrames: ["/decorations/house1.png", "/decorations/house2.png", "/decorations/house3.png"],
  },
  // Knights House - single colourable entry (Update 010 pack). Blue is the
  // base sprite; red/purple/yellow resolve via decoSrc(). No black variant in
  // the pack, so `colors` limits the swatches to the four that exist.
  house_knight: {
    label: "Knights House",
    src: "/decorations/house_knight.png",
    frameW: 128, frameH: 192, frames: 1,
    terrain: "land", category: "buildings", family: "house",
    colorable: true, colors: ["blue", "red", "purple", "yellow"],
  },
  // Goblin Wood House - the only Goblin house variant in the pack.
  house_goblin: {
    label: "Goblin House",
    src: "/decorations/house_goblin.png",
    frameW: 128, frameH: 192, frames: 1,
    terrain: "land", category: "buildings", family: "house",
  },
  // Gold Mine - three states from the Update 010 Resources/Gold Mine
  // folder. All 192×128 static frames anchored at bottom-centre (the
  // sprite spans ~3 cells wide and ~2 cells tall visually). Single
  // "gold_mine" family so a cell only ever shows one state at a time -
  // switching between active/inactive/destroyed swaps the sprite in
  // place.
  gold_mine_active: {
    label: "Gold mine (active)",
    src: "/decorations/gold_mine_active.png",
    frameW: 192, frameH: 128, frames: 1,
    terrain: "land", category: "buildings", family: "gold_mine",
  },
  gold_mine_inactive: {
    label: "Gold mine (inactive)",
    src: "/decorations/gold_mine_inactive.png",
    frameW: 192, frameH: 128, frames: 1,
    terrain: "land", category: "buildings", family: "gold_mine",
  },
  gold_mine_destroyed: {
    label: "Gold mine (destroyed)",
    src: "/decorations/gold_mine_destroyed.png",
    frameW: 192, frameH: 128, frames: 1,
    terrain: "land", category: "buildings", family: "gold_mine",
  },
  // Cursed chest - animated 6×64×64. A small land prop, not a structure,
  // so it lives in the Land tab alongside the other ground decorations.
  cursed_chest: {
    label: "Cursed chest",
    src: "/decorations/cursed_chest.png",
    frameW: 64, frameH: 64, frames: 6,
    terrain: "land", category: "land", family: "cursed_chest",
    animClass: "animate-[deco-cursed-chest_1.8s_steps(6)_infinite]",
  },
  tower: {
    label: "Tower",
    src: "/decorations/tower.png",
    frameW: 128, frameH: 256, frames: 1,
    terrain: "land", category: "buildings", family: "tower", colorable: true,
  },
  castle: {
    label: "Castle",
    src: "/decorations/castle.png",
    frameW: 320, frameH: 256, frames: 1,
    terrain: "land", category: "buildings", family: "castle", colorable: true,
  },
  // Archery, Barracks, Monastery — the remaining Tiny Swords building types.
  // Blue is the base sprite; red/purple/yellow/black resolve via decoSrc().
  archery: {
    label: "Archery",
    src: "/decorations/archery.png",
    frameW: 192, frameH: 256, frames: 1,
    terrain: "land", category: "buildings", family: "archery", colorable: true,
  },
  barracks: {
    label: "Barracks",
    src: "/decorations/barracks.png",
    frameW: 192, frameH: 256, frames: 1,
    terrain: "land", category: "buildings", family: "barracks", colorable: true,
  },
  monastery: {
    label: "Monastery",
    src: "/decorations/monastery.png",
    frameW: 192, frameH: 320, frames: 1,
    terrain: "land", category: "buildings", family: "monastery", colorable: true,
  },

  // ─ Water rocks (16 frames × 64×64, bobs in time with foam) ─────────
  water_rock: {
    label: "Water rock 1",
    src: "/decorations/water-rock.png",
    frameW: 64, frameH: 64, frames: 16,
    terrain: "water", category: "water", family: "water_rock", animClass: "animate-[deco-water-rock_1.6s_steps(16)_infinite]",
  },
  water_rock2: {
    label: "Water rock 2",
    src: "/decorations/water-rock2.png",
    frameW: 64, frameH: 64, frames: 16,
    terrain: "water", category: "water", family: "water_rock", animClass: "animate-[deco-water-rock_1.6s_steps(16)_infinite]",
  },
  water_rock3: {
    label: "Water rock 3",
    src: "/decorations/water-rock3.png",
    frameW: 64, frameH: 64, frames: 16,
    terrain: "water", category: "water", family: "water_rock", animClass: "animate-[deco-water-rock_1.6s_steps(16)_infinite]",
  },
  water_rock4: {
    label: "Water rock 4",
    src: "/decorations/water-rock4.png",
    frameW: 64, frameH: 64, frames: 16,
    terrain: "water", category: "water", family: "water_rock", animClass: "animate-[deco-water-rock_1.6s_steps(16)_infinite]",
  },

  // ─ Duck (3 frames × 32×32, quick wobble) ────────────────────────────
  duck: {
    label: "Duck",
    src: "/decorations/duck.png",
    frameW: 32, frameH: 32, frames: 3,
    terrain: "water", category: "water", family: "duck", animClass: "animate-[deco-duck_0.6s_steps(3)_infinite]",
  },

  // ─ Mushrooms (static 64×64, three sizes) ────────────────────────────
  mushroom1: {
    label: "Mushroom (small)",
    src: "/decorations/mushroom1.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "mushroom",
  },
  mushroom2: {
    label: "Mushroom (medium)",
    src: "/decorations/mushroom2.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "mushroom",
  },
  mushroom3: {
    label: "Mushroom (large)",
    src: "/decorations/mushroom3.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "mushroom",
  },

  // ─ Shrubs / dark foliage (static 64×64) ─────────────────────────────
  shrub1: {
    label: "Shrub 1",
    src: "/decorations/shrub1.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "shrub",
  },
  shrub2: {
    label: "Shrub 2",
    src: "/decorations/shrub2.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "shrub",
  },
  shrub3: {
    label: "Shrub 3",
    src: "/decorations/shrub3.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "shrub",
  },
  shrub4: {
    label: "Shrub 4",
    src: "/decorations/shrub4.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "shrub",
  },
  shrub5: {
    label: "Shrub 5",
    src: "/decorations/shrub5.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "shrub",
  },

  // ─ Pumpkins (static 64×64) ──────────────────────────────────────────
  pumpkin1: {
    label: "Pumpkin (small)",
    src: "/decorations/pumpkin1.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "pumpkin",
  },
  pumpkin2: {
    label: "Pumpkin (large)",
    src: "/decorations/pumpkin2.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "pumpkin",
  },

  // ─ Bones (static 64×64) ─────────────────────────────────────────────
  bones1: {
    label: "Bones 1",
    src: "/decorations/bones1.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "bones",
  },
  bones2: {
    label: "Bones 2",
    src: "/decorations/bones2.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "land", family: "bones",
  },

  // ─ Tall props (64×128, extend upward into the cell above) ───────────
  bone_sign: {
    label: "Bone sign",
    src: "/decorations/bone-sign.png",
    frameW: 64, frameH: 128, frames: 1,
    terrain: "land", category: "land", family: "sign",
  },
  gravestone: {
    label: "Gravestone",
    src: "/decorations/gravestone.png",
    frameW: 64, frameH: 128, frames: 1,
    terrain: "land", category: "land", family: "grave",
  },

  // ─ Scarecrow (large 192×192, spans 3×3 visually) ────────────────────
  scarecrow: {
    label: "Scarecrow",
    src: "/decorations/scarecrow.png",
    frameW: 192, frameH: 192, frames: 1,
    terrain: "land", category: "land", family: "scarecrow",
  },

  // ─ Sheep (animated, 8 × 128×128). Reuses the deco-bush keyframe
  //   since both sheets have identical 1024×128 stride. Agents standing
  //   on a sheep tile while working switch to the knife animation
  //   (sheep-shearing pose) - see OfficeMap. ───────────────────────────
  sheep: {
    label: "Sheep",
    src: "/decorations/sheep.png",
    frameW: 128, frameH: 128, frames: 8,
    terrain: "land", category: "animals", family: "sheep", animClass: "animate-[deco-bush_1.6s_steps(8)_infinite]",
    anchor: "center",
  },

  // ─ Butterfly (5 frames × 16×16, animated flutter). Single colourable
  //   entry; blue is the base sprite, other colours resolve via decoSrc().
  //   Centred so it hovers over the tile. ─────────────────────────────
  butterfly: {
    label: "Butterfly",
    src: "/decorations/butterfly.png",
    frameW: 16, frameH: 16, frames: 5,
    terrain: "land", category: "animals", family: "butterfly", animClass: "animate-[deco-butterfly_0.7s_steps(5)_infinite]",
    anchor: "center",
    colorable: true, colors: ["blue", "grey", "pink", "red", "white", "yellow"],
  },

  // ─ Raised floor (levels). A marker decoration: placing it on a land cell
  //   lifts that cell to the next tier — the terrain renderer swaps it to the
  //   elevated grass tileset and auto-draws a stone cliff wall on any edge that
  //   drops to a lower cell. Renders no sprite of its own (handled in
  //   build-static-layers), so `src` is only the palette thumbnail: an interior
  //   elevated-grass tile cropped from the shared 9×6 grass sheet.
  floor: {
    label: "Raised floor",
    src: "/tiles/grass.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "levels", family: "floor",
    sheetW: 576, sheetH: 384, previewCol: 6, previewRow: 1,
  },

  // ─ Path (64×64 per tile, land-only). Procedurally generated at render time
  //   (see pixi/path/*): each cell's tile is drawn from a material config +
  //   world-space noise, auto-connecting to the 8 neighbouring "path" cells.
  //   Single "path" family so at most one path tile occupies a cell at a time.
  //   `src` is only used for the static toolbar thumbnail. ──────────────
  path: {
    label: "Dirt",
    src: "/tiles/path-dirt.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "paths", family: "path", pathMaterial: "dirt",
  },
  path_stone: {
    label: "Cobble",
    src: "/tiles/path-stone.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "paths", family: "path", pathMaterial: "stone",
  },
  path_sand: {
    label: "Sand",
    src: "/tiles/path-sand.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "paths", family: "path", pathMaterial: "sand",
  },
  path_gravel: {
    label: "Gravel",
    src: "/tiles/path-gravel.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "land", category: "paths", family: "path", pathMaterial: "gravel",
  },

  // ─ Bridges (static 64×64, water-only). Only the middle plank is
  //   player-placeable - the matching end caps are painted
  //   automatically by OfficeMap onto neighbouring land cells, so the
  //   bridge always meets land cleanly without forcing the user to
  //   place caps manually. Single "bridge" family per cell. ────────────
  bridge_h: {
    label: "Bridge - horizontal",
    src: "/decorations/bridge-h-m.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "water", category: "water", family: "bridge",
  },
  bridge_v: {
    label: "Bridge - vertical",
    src: "/decorations/bridge-v-m.png",
    frameW: 64, frameH: 64, frames: 1,
    terrain: "water", category: "water", family: "bridge",
  },
};

/**
 * Auto-rendered bridge end-cap sprites. These are NOT placeable
 * decorations - OfficeMap paints them on land cells that touch a
 * placed `bridge_h` / `bridge_v` middle tile, so the bridge always
 * "lands" with a proper end-piece without the user having to manage
 * caps in the build palette.
 *
 * Each entry is a 64×64 PNG; the sprite art already has transparent
 * padding on the side that connects to the bridge middle (left half
 * for the LEFT cap, right half for the RIGHT cap, etc.), so painting
 * the full tile on top of a land cell only covers the half that
 * meets the bridge.
 */
export const BRIDGE_CAPS = {
  h_l: { src: "/decorations/bridge-h-l.png", frameW: 64, frameH: 64 },
  h_r: { src: "/decorations/bridge-h-r.png", frameW: 64, frameH: 64 },
  v_t: { src: "/decorations/bridge-v-t.png", frameW: 64, frameH: 64 },
  v_b: { src: "/decorations/bridge-v-b.png", frameW: 64, frameH: 64 },
} as const;

export const DECORATION_KINDS: DecorationKind[] = Object.keys(DECORATIONS) as DecorationKind[];

/**
 * "x,y" → ordered list of decorations stacked at that cell. The list is
 * read back-to-front: earlier entries render below later entries. By
 * convention placement keeps solids before overlays, so a tree's leaves
 * draw under any bushes/rocks placed at the same cell.
 *
 * Sparse - cells with no decoration aren't keys (empty arrays are
 * cleaned up on erase so the map size stays minimal).
 */
/**
 * A single placed decoration instance. `kind` is the sprite; the rest are
 * per-instance edits applied by the free-hand tool:
 *   - rot:  rotation frame index (0/1/2) for kinds that declare rotation frames
 *   - flip: horizontal mirror
 *   - dx/dy: pixel offset within the cell (clamped to ±TILE at the edit site)
 * All optional → an unedited instance is just `{ kind }`.
 */
/** Colour-variant tokens for `colorable` decorations. "blue" is the base
 *  sprite; others resolve to `<name>_<color>.png`. Buildings use the faction
 *  set (blue/red/purple/yellow/black); butterflies add grey/pink/white. Each
 *  decoration picks its available subset via `DecorationDef.colors`. */
export type BuildingColor =
  | "blue" | "red" | "purple" | "yellow" | "black" | "grey" | "pink" | "white";

/** Master swatch hex for every colour token. */
export const COLOR_HEX: Record<BuildingColor, string> = {
  blue: "#4a90d9",
  red: "#d94a4a",
  purple: "#9b6bd6",
  yellow: "#e0b23c",
  black: "#3a3a42",
  grey: "#9aa0a8",
  pink: "#e88bc0",
  white: "#e8e8ea",
};

/** Default swatch set (faction colours) for a `colorable` def with no
 *  explicit `colors` list. */
export const BUILDING_COLORS: { id: BuildingColor; hex: string }[] =
  (["blue", "red", "purple", "yellow", "black"] as BuildingColor[]).map((id) => ({ id, hex: COLOR_HEX[id] }));

export type DecoInstance = {
  kind: DecorationKind;
  rot?: 0 | 1 | 2;
  flip?: boolean;
  dx?: number;
  dy?: number;
  /** Faction colour for `colorable` buildings. Omitted = blue (base sprite). */
  color?: BuildingColor;
  /** Manual draw-order bias. Sprites sort by z first, then row (y), then stack
   *  position — so a higher z brings the item in front of overlapping sprites,
   *  lower sends it behind. Omitted = 0. */
  z?: number;
};

/**
 * Resolves the sprite URL for an instance, accounting for rotation frame and
 * faction colour. Blue (or no colour) uses the base sprite; other colours map
 * to `<name>_<color>.png`.
 */
export function decoSrc(def: DecorationDef, inst: DecoInstance): string {
  const base = def.rotFrames?.[inst.rot ?? 0] ?? def.src;
  if (!def.colorable || !inst.color || inst.color === "blue") return base;
  return base.replace(/\.png$/, `_${inst.color}.png`);
}

export type DecorationsMap = Record<string, DecoInstance[]>;

export function decorationKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Returns true when the decoration's terrain requirement matches the
 * cell's actual state. `cellHasGrass=true` means the cell is land.
 */
export function isPlacementValid(kind: DecorationKind, cellHasGrass: boolean): boolean {
  return DECORATIONS[kind].terrain === (cellHasGrass ? "land" : "water");
}

export function familyOf(kind: DecorationKind): DecoFamily {
  return DECORATIONS[kind].family;
}

/**
 * Props (bushes, trees, rocks, flowers, ducks, …) may be placed multiple times
 * in a single cell and spread apart with per-instance offsets. Structural kinds
 * — buildings, bridges, and paths — stay one-per-cell.
 */
export function isStackable(kind: DecorationKind): boolean {
  const def = DECORATIONS[kind];
  return def.category !== "buildings" && def.family !== "bridge" && def.family !== "path" && def.family !== "floor";
}

/**
 * Ground footprint in tiles (`w` wide × `d` deep) for buildings that occupy
 * more than one cell. Anchored at the placement cell: centred horizontally
 * (even widths bias left) and extending `d` rows back/up. Anything not listed
 * is 1×1. Tune these per building — they're the ground the building "sits on",
 * not the full sprite width (roofs overhang).
 */
export const BUILDING_FOOTPRINTS: Partial<Record<DecorationKind, { w: number; d: number }>> = {
  house: { w: 2, d: 2 },
  house_knight: { w: 2, d: 2 },
  house_goblin: { w: 1, d: 2 },
  tower: { w: 1, d: 2 },
  archery: { w: 2, d: 2 },
  barracks: { w: 3, d: 2 },
  monastery: { w: 2, d: 2 },
  castle: { w: 5, d: 2 },
  gold_mine_active: { w: 3, d: 2 },
  gold_mine_inactive: { w: 3, d: 2 },
  gold_mine_destroyed: { w: 3, d: 2 },
};

/** The set of cells a decoration occupies when anchored at (x, y). */
export function footprintCells(kind: DecorationKind, x: number, y: number): [number, number][] {
  const fp = BUILDING_FOOTPRINTS[kind];
  if (!fp) return [[x, y]];
  const startX = x - Math.floor((fp.w - 1) / 2);
  const cells: [number, number][] = [];
  for (let dx = 0; dx < fp.w; dx++) {
    for (let dy = 0; dy < fp.d; dy++) cells.push([startX + dx, y - dy]);
  }
  return cells;
}

/**
 * Horizontal sprite shift (in tiles) so the sprite centres over its whole
 * footprint rather than over just the anchor cell. Even-width footprints
 * straddle a tile boundary, so their centre is ½ tile right of the anchor
 * cell's centre; odd widths (and 1×1) need no shift. Multiply by TILE and add
 * to the sprite's left in every place that positions a decoration.
 */
export function footprintCenterShift(kind: DecorationKind): number {
  const w = BUILDING_FOOTPRINTS[kind]?.w ?? 1;
  return -Math.floor((w - 1) / 2) + w / 2 - 0.5;
}

/**
 * All cells covered by a placed building's footprint, mapped back to the anchor
 * key that owns them. Used to block overlapping placement. Non-building decos
 * (props, bridges, paths) don't reserve area.
 */
export function buildingOccupancy(decorations: DecorationsMap): Map<string, string> {
  const occ = new Map<string, string>();
  for (const [key, stack] of Object.entries(decorations)) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    for (const inst of stack) {
      if (DECORATIONS[inst.kind].category !== "buildings") continue;
      for (const [cx, cy] of footprintCells(inst.kind, x, y)) occ.set(decorationKey(cx, cy), key);
    }
  }
  return occ;
}

/** True when the cell carries a raised-floor decoration (a 2nd-floor platform). */
export function cellIsRaised(x: number, y: number, decorations: DecorationsMap): boolean {
  const stack = decorations[decorationKey(x, y)];
  return !!stack && stack.some((e) => DECORATIONS[e.kind].family === "floor");
}

/** True when the cell holds a bridge plank of the given axis. */
function hasBridgeAxis(x: number, y: number, decorations: DecorationsMap, kind: "bridge_h" | "bridge_v"): boolean {
  const stack = decorations[decorationKey(x, y)];
  return !!stack && stack.some((e) => e.kind === kind);
}

/**
 * A bridge may also be placed on a LOWER (non-raised) land cell to span the gap
 * between raised platforms — valid when, along the bridge's axis, at least one
 * neighbour is a raised platform (or an existing same-axis bridge, so a wider
 * gap can be filled). Complements the normal water placement.
 */
export function bridgeGapValid(
  kind: DecorationKind,
  x: number,
  y: number,
  grid: boolean[][],
  decorations: DecorationsMap,
): boolean {
  if (kind !== "bridge_h" && kind !== "bridge_v") return false;
  if (grid[y]?.[x] !== true) return false; // gap must be land
  if (cellIsRaised(x, y, decorations)) return false; // and lower than the platforms
  const connects = (cx: number, cy: number) =>
    cellIsRaised(cx, cy, decorations) || hasBridgeAxis(cx, cy, decorations, kind);
  return kind === "bridge_h"
    ? connects(x - 1, y) || connects(x + 1, y)
    : connects(x, y - 1) || connects(x, y + 1);
}

/**
 * True when a bridge end-cap would render on cell `(x, y)`. Mirrors the
 * cap-painting logic in OfficeMap: a cap appears iff the cell is land
 * AND a neighbouring water cell holds a bridge middle that points at
 * this cell (horizontal bridge on the L/R neighbour, vertical bridge on
 * the T/B neighbour).
 *
 * Used to block decoration placement on the cap cell - once a bridge
 * uses a land tile as its anchor, that tile is reserved for the
 * bridge ramp.
 */
export function hasBridgeCap(
  x: number,
  y: number,
  grid: boolean[][],
  decorations: DecorationsMap,
): boolean {
  if (grid[y]?.[x] !== true) return false;
  const has = (cx: number, cy: number, kind: DecorationKind): boolean => {
    const stack = decorations[decorationKey(cx, cy)];
    return !!stack && stack.some((e) => e.kind === kind);
  };
  return (
    has(x - 1, y, "bridge_h") ||
    has(x + 1, y, "bridge_h") ||
    has(x, y - 1, "bridge_v") ||
    has(x, y + 1, "bridge_v")
  );
}

/**
 * Apply a single placement to a cell's stack, returning the new stack.
 *
 *   - If the cell already has a decoration of the same family, replace
 *     it in-place (preserves stack order, does not count toward cap).
 *   - If the stack is at MAX_STACK and no same-family slot exists, no-op.
 *   - Exact-same-kind is a no-op (returns same reference).
 *
 * `existing` may be undefined for empty cells.
 */
const MAX_STACK = 2;
// Stackable props can pile up in a cell (spread apart with per-instance
// offsets); higher cap keeps the map JSON bounded.
const MAX_STACK_PROPS = 12;

export function applyPlacement(
  existing: DecoInstance[] | undefined,
  next: DecorationKind,
): DecoInstance[] {
  if (!existing || existing.length === 0) return [{ kind: next }];
  // Stackable props: always add another instance (up to the prop cap) so the
  // user can place several bushes/rocks/flowers in one cell and nudge them apart.
  if (isStackable(next)) {
    if (existing.length >= MAX_STACK_PROPS) return existing;
    return [...existing, { kind: next }];
  }
  const family = familyOf(next);
  const idx = existing.findIndex((e) => familyOf(e.kind) === family);
  // Same family: replace in-place regardless of cap
  if (idx !== -1) {
    if (existing[idx]!.kind === next) return existing; // no-op
    const out = [...existing];
    out[idx] = { kind: next };
    return out;
  }
  // Different family: only append if under the cap
  if (existing.length >= MAX_STACK) return existing;
  return [...existing, { kind: next }];
}

/**
 * Remove the topmost decoration from a cell's stack - last-in-first-out.
 * Returns the new stack (possibly empty) and the removed kind, or null
 * if nothing was there.
 */
export function popDecoration(
  existing: DecoInstance[] | undefined,
): { stack: DecoInstance[]; removed: DecoInstance } | null {
  if (!existing || existing.length === 0) return null;
  const stack = [...existing];
  const removed = stack.pop()!;
  return { stack, removed };
}
