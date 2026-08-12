import { decorationKey, familyOf, type DecorationsMap } from "../components/decorations";

export type AgentAction = "idle" | "axe" | "pickaxe" | "knife" | "hammer";

/**
 * Determines the action animation and flip flag for an agent based on its
 * tile and surrounding decorations. Shared by both the DOM and Pixi renderers.
 * Action animations are pawn-exclusive; all other kinds always return idle.
 */
export function getAgentActionAndFlip(
  x: number,
  y: number,
  isWorking: boolean,
  kind: string,
  decorations: DecorationsMap,
): { action: AgentAction; flip: boolean } {
  if (!isWorking || kind !== "pawn") return { action: "idle", flip: false };
  const has = (nx: number, ny: number, f: string): boolean => {
    const stack = decorations[decorationKey(nx, ny)];
    return !!stack && stack.some((k) => familyOf(k.kind) === f);
  };
  // Trees are tall — check the agent's cell, one cell above, and all four
  // cardinal neighbours (plus their y+1 row) so standing next to a tree fires axe.
  const treeRight = has(x + 1, y, "tree") || has(x + 1, y + 1, "tree");
  const treeLeft  = has(x - 1, y, "tree") || has(x - 1, y + 1, "tree");
  const treeNear  = has(x, y, "tree") || has(x, y - 1, "tree")
                 || has(x, y + 1, "tree") || has(x, y + 2, "tree");
  const hasTree = treeRight || treeLeft || treeNear;
  const sheepRight = has(x + 1, y, "sheep");
  const sheepLeft = has(x - 1, y, "sheep");
  if (hasTree) return { action: "axe", flip: treeLeft && !treeRight };
  if (has(x, y, "rock")) return { action: "pickaxe", flip: false };
  if (sheepRight || sheepLeft) return { action: "knife", flip: !sheepRight && sheepLeft };
  return { action: "hammer", flip: false };
}

/**
 * Returns true if the cell is a bridge water cell (no grass tile, but has a
 * bridge decoration). Agents positioned here render elevated above the water.
 */
export function isBridgeCell(
  x: number,
  y: number,
  grid: boolean[][],
  decorations: DecorationsMap,
): boolean {
  if (grid[y]?.[x] === true) return false;
  const stack = decorations[decorationKey(x, y)];
  return !!stack && stack.some((k) => familyOf(k.kind) === "bridge");
}
