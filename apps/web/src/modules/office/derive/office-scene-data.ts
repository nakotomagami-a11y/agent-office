import { GRID_COLS, GRID_ROWS } from "../hooks/use-office-camera";
import { DECORATIONS, COLOR_HEX, type BuildingColor, type DecorationKind, type DecoInstance, type DecorationsMap } from "../components/decorations";
import type { AgentPositions } from "../components/office-map";
import type { AgentInstance } from "@agent-office/domain/types";

// Renamed/removed bridge kinds get rewritten on load. The four cap kinds
// (bridge_h_l/r, bridge_v_t/b) are no longer placeable — caps now auto-
// paint on adjacent land cells — so any persisted cap drops silently.
// The middle kinds got shorter names: bridge_h_m → bridge_h, _v_m → _v.
const KIND_MIGRATIONS: Record<string, DecorationKind | null> = {
  bridge_h_m: "bridge_h",
  bridge_v_m: "bridge_v",
  bridge_h_l: null,
  bridge_h_r: null,
  bridge_v_t: null,
  bridge_v_b: null,
  // Removed off-style AI houses — drop any placed instances.
  house4: null,
  house5: null,
};

export function migrateKind(raw: string): DecorationKind | null {
  if (raw in KIND_MIGRATIONS) return KIND_MIGRATIONS[raw] ?? null;
  return raw in DECORATIONS ? (raw as DecorationKind) : null;
}

export function parseGrid(raw: string): boolean[][] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every((row) => Array.isArray(row) && row.every((c) => typeof c === "boolean"))) {
      return null;
    }
    const src = parsed as boolean[][];
    // Pad/crop the saved grid to the current dimensions instead of rejecting it,
    // so a map survives changes to GRID_COLS/GRID_ROWS (existing land keeps its
    // tile coords; new area is water). Prevents dimension changes from wiping
    // the user's build on reload.
    if (src.length === GRID_ROWS && src[0]?.length === GRID_COLS) return src;
    return Array.from({ length: GRID_ROWS }, (_, y) =>
      Array.from({ length: GRID_COLS }, (_, x) => src[y]?.[x] === true),
    );
  } catch { /* ignore */ }
  return null;
}

export function parseDecorations(raw: string): DecorationsMap | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: DecorationsMap = {};
    // Legacy house1/2/3 kinds are now the single rotatable "house" (rot 0/1/2).
    const HOUSE_ROT: Record<string, 0 | 1 | 2> = { house1: 0, house2: 1, house3: 2 };
    // Legacy per-colour Knights House kinds → the single colourable "house_knight".
    const HOUSE_KNIGHT_COLOR: Record<string, BuildingColor> = {
      house_blue: "blue", house_red: "red", house_purple: "purple", house_yellow: "yellow",
    };
    // Legacy per-colour butterfly kinds → the single colourable "butterfly".
    const BUTTERFLY_COLOR: Record<string, BuildingColor> = {
      butterfly_blue: "blue", butterfly_grey: "grey", butterfly_pink: "pink",
      butterfly_red: "red", butterfly_white: "white", butterfly_yellow: "yellow",
    };
    // Accepts legacy formats (a bare kind string, or an array of kind strings)
    // and the current object form `{ kind, rot?, flip?, dx?, dy? }`.
    const toInstance = (v: unknown): DecoInstance | null => {
      if (typeof v === "string") {
        if (v in HOUSE_ROT) {
          const rot = HOUSE_ROT[v]!;
          return rot === 0 ? { kind: "house" } : { kind: "house", rot };
        }
        if (v in HOUSE_KNIGHT_COLOR) {
          const color = HOUSE_KNIGHT_COLOR[v]!;
          return color === "blue" ? { kind: "house_knight" } : { kind: "house_knight", color };
        }
        if (v in BUTTERFLY_COLOR) {
          const color = BUTTERFLY_COLOR[v]!;
          return color === "blue" ? { kind: "butterfly" } : { kind: "butterfly", color };
        }
        const kind = migrateKind(v);
        return kind ? { kind } : null;
      }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const o = v as Record<string, unknown>;
        if (typeof o.kind !== "string") return null;
        const houseRot = o.kind in HOUSE_ROT ? HOUSE_ROT[o.kind] : undefined;
        const knightColor = o.kind in HOUSE_KNIGHT_COLOR ? HOUSE_KNIGHT_COLOR[o.kind] : undefined;
        const butterflyColor = o.kind in BUTTERFLY_COLOR ? BUTTERFLY_COLOR[o.kind] : undefined;
        const kind = houseRot !== undefined ? "house"
          : knightColor !== undefined ? "house_knight"
          : butterflyColor !== undefined ? "butterfly"
          : migrateKind(o.kind);
        if (!kind) return null;
        const inst: DecoInstance = { kind };
        const legacyColor = knightColor ?? butterflyColor;
        if (legacyColor && legacyColor !== "blue") inst.color = legacyColor;
        const rot = houseRot ?? o.rot;
        if (rot === 1 || rot === 2) inst.rot = rot;
        if (o.flip === true) inst.flip = true;
        if (typeof o.dx === "number" && o.dx !== 0) inst.dx = o.dx;
        if (typeof o.dy === "number" && o.dy !== 0) inst.dy = o.dy;
        // Current form: colour stored on the instance. Accept any known token
        // except "blue" (the base sprite needs no colour).
        if (typeof o.color === "string" && o.color !== "blue" && o.color in COLOR_HEX) {
          inst.color = o.color as BuildingColor;
        }
        if (typeof o.z === "number" && o.z !== 0) inst.z = o.z;
        return inst;
      }
      return null;
    };
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string") {
        const inst = toInstance(value);
        if (inst) out[key] = [inst];
        continue;
      }
      if (Array.isArray(value)) {
        const arr: DecoInstance[] = [];
        for (const v of value) {
          const inst = toInstance(v);
          if (inst) arr.push(inst);
        }
        if (arr.length > 0) out[key] = arr;
      }
    }
    return out;
  } catch { /* ignore */ }
  return null;
}

export function parseAgentPositions(raw: string): AgentPositions | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: AgentPositions = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        value && typeof value === "object" && !Array.isArray(value) &&
        typeof (value as { agentId?: unknown }).agentId === "string"
      ) {
        const v = value as { agentId: string; instanceId?: unknown; flip?: unknown; z?: unknown; dx?: unknown; dy?: unknown };
        const placement: AgentPositions[string] = { agentId: v.agentId, instanceId: typeof v.instanceId === "string" ? v.instanceId : undefined };
        if (v.flip === true) placement.flip = true;
        if (typeof v.z === "number" && v.z !== 0) placement.z = v.z;
        if (typeof v.dx === "number" && v.dx !== 0) placement.dx = v.dx;
        if (typeof v.dy === "number" && v.dy !== 0) placement.dy = v.dy;
        out[key] = placement;
      }
    }
    return out;
  } catch { /* ignore */ }
  return null;
}

export function makeSeedGrid(): boolean[][] {
  return Array.from({ length: GRID_ROWS }, () =>
    Array.from({ length: GRID_COLS }, () => false),
  );
}

/**
 * BFS flood-fill: turns connected water cells starting at (startX, startY)
 * into grass. Returns the new grid and the number of cells filled.
 */
export function floodFill(
  grid: boolean[][],
  startX: number,
  startY: number,
): [boolean[][], number] {
  if (grid[startY]?.[startX] === true) return [grid, 0];
  const next = grid.map((row) => [...row]);
  const visited = new Uint8Array(GRID_COLS * GRID_ROWS);
  let head = 0;
  const queue: [number, number][] = [[startX, startY]];
  let count = 0;
  while (head < queue.length) {
    const [x, y] = queue[head++]!;
    if (x < 0 || x >= GRID_COLS || y < 0 || y >= GRID_ROWS) continue;
    const idx = y * GRID_COLS + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    if (next[y]![x]) continue;
    next[y]![x] = true;
    count++;
    queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
  return [next, count];
}

export type Snapshot = {
  grid: boolean[][];
  decorations: DecorationsMap;
  agentPositions: AgentPositions;
};

// Stable empty-array and empty-object fallbacks to avoid recreating them
// on every render (which would defeat React.memo equality checks).
export const EMPTY_ROSTER: AgentInstance[] = [];
export const EMPTY_SPEND: Record<string, number> = {};
