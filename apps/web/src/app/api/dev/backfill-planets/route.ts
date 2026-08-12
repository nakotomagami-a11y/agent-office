import { NextResponse } from "next/server";
import { projects } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/log";
import type { PlanetConfig, PlanetType } from "@agent-office/domain/types";

/**
 * One-shot backfill for projects created before the `planet:` frontmatter key
 * shipped. For each project missing `planet` in its metadata, generate a random
 * planet config (across all 11 types) and persist it via `updateProject`.
 *
 * Idempotent: projects that already have a `planet` are skipped, so a second
 * run is a no-op. There is intentionally no GET — this mutates on-disk state.
 * Trigger manually:
 *   curl -X POST http://localhost:3000/api/dev/backfill-planets
 */

// Mirrors autoRandomPlanet() in packages/domain/src/services/projects.ts.
// Kept in-file so the route is self-contained and does not depend on an
// export that may change between planets refactors.
const PLANET_TYPES: PlanetType[] = [
  "gas-giant", "rocky", "dry", "terran", "ice", "islands",
  "lava", "black-hole", "galaxy", "star", "asteroid",
];

const PALETTE_COUNT_BY_TYPE: Record<PlanetType, number> = {
  "gas-giant": 6,
  "rocky": 5,
  "dry": 5,
  "terran": 5,
  "ice": 5,
  "islands": 5,
  "lava": 5,
  "black-hole": 5,
  "galaxy": 5,
  "star": 5,
  "asteroid": 5,
};

function randomPlanetConfig(): PlanetConfig {
  const type = PLANET_TYPES[Math.floor(Math.random() * PLANET_TYPES.length)]!;
  return {
    type,
    seed: Math.floor(Math.random() * 999_999_999) + 1,
    paletteIdx: Math.floor(Math.random() * PALETTE_COUNT_BY_TYPE[type]),
    pixels: 1000,
    dither: true,
  };
}

interface BackfillEntry {
  id: string;
  action: "backfilled" | "skipped";
}

export async function POST() {
  // Dev-only surface. Prod builds get a 404.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const summaries = projects.listProjectSummaries();

  const entries: BackfillEntry[] = [];
  let backfilled = 0;
  let skipped = 0;

  for (const summary of summaries) {
    const full = projects.readProject(summary.id);
    if (!full) {
      entries.push({ id: summary.id, action: "skipped" });
      skipped += 1;
      continue;
    }

    if (full.meta.planet) {
      entries.push({ id: summary.id, action: "skipped" });
      skipped += 1;
      continue;
    }

    const planet = randomPlanetConfig();
    projects.updateProject(summary.id, { meta: { planet } });
    log.info("dev.backfill_planet", { projectId: summary.id, type: planet.type, seed: planet.seed });
    entries.push({ id: summary.id, action: "backfilled" });
    backfilled += 1;
  }

  return NextResponse.json({ backfilled, skipped, projects: entries });
}
