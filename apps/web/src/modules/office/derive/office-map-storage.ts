// Server is the single source of truth for the office map. The whole map is
// written in ONE atomic PATCH (grid + decorations + grass + agents + rev) so it
// can never persist in a torn state (the old per-key auto-save let the grid and
// decorations drift to different points in time). An unsaved edit stays dirty
// and is retried by the periodic flush and the unload beacon; there is no
// client-side copy, so nothing depends on the page origin.
import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";
import { parseGrid, parseDecorations, parseAgentPositions, makeSeedGrid } from "./office-scene-data";
import { isGrassColor, DEFAULT_GRASS_COLOR, type GrassColor } from "../components/grass-colors";
import type { DecorationsMap } from "../components/decorations";
import type { AgentPositions } from "../components/office-map";

export type OfficeMap = {
  grid: boolean[][];
  decorations: DecorationsMap;
  grassColor: GrassColor;
  agentPositions: AgentPositions;
};

export type Scope = { projectId: string | null; custom: boolean };

// Grid/decorations/grass live on the shared keys unless the project opted into a
// custom map; agent positions are always per-project when a project is active.
export function scopeKeys({ projectId, custom }: Scope) {
  const suffix = custom && projectId ? `:${projectId}` : "";
  return {
    grid: `office-grid${suffix}`,
    deco: `office-decorations${suffix}`,
    grass: `office-grass-color${suffix}`,
    agents: projectId ? `office-agents:${projectId}` : "office-agents",
    rev: `office-map-rev${suffix}`,
  };
}

// Pure: turn a settings snapshot into a fully-defaulted map for the given scope.
export function parseMap(settings: Record<string, string>, scope: Scope): { map: OfficeMap; rev: number } {
  const k = scopeKeys(scope);
  const rawGrid = settings[k.grid];
  const rawDeco = settings[k.deco];
  const rawAgents = settings[k.agents];
  const grid = rawGrid ? parseGrid(rawGrid) : null;
  const deco = rawDeco ? parseDecorations(rawDeco) : null;
  const agents = rawAgents ? parseAgentPositions(rawAgents) : null;
  const grass = settings[k.grass];
  return {
    map: {
      grid: grid ?? makeSeedGrid(),
      decorations: deco ?? {},
      grassColor: grass && isGrassColor(grass) ? grass : DEFAULT_GRASS_COLOR,
      agentPositions: agents ?? {},
    },
    rev: Number(settings[k.rev] ?? 0) || 0,
  };
}

function patchBody(scope: Scope, map: OfficeMap, rev: number): Record<string, string> {
  const k = scopeKeys(scope);
  return {
    [k.grid]: JSON.stringify(map.grid),
    [k.deco]: JSON.stringify(map.decorations),
    [k.grass]: map.grassColor,
    [k.agents]: JSON.stringify(map.agentPositions),
    [k.rev]: String(rev),
  };
}

// Atomic save. Throws (ApiError) on any non-2xx / network failure so the caller
// can surface it and keep the local backup marked dirty.
export async function saveMap(scope: Scope, map: OfficeMap): Promise<number> {
  const rev = Date.now();
  await apiClient.patch(API_ROUTES.uiSettings, patchBody(scope, map, rev));
  return rev;
}

// Best-effort flush during page hide/unload. `keepalive` lets the request
// outlive the document, which a normal awaited fetch cannot.
export function flushMapBeacon(scope: Scope, map: OfficeMap): void {
  if (typeof fetch === "undefined") return;
  try {
    fetch(API_ROUTES.uiSettings, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchBody(scope, map, Date.now())),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
