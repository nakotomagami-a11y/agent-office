// POST /api/dev/backfill-planets — one-shot, idempotent dev backfill: give every
// project created before the `planet:` frontmatter key a random planet config.
import { NextResponse } from "next/server";
import { projects } from "@agent-office/domain/services";
import { log } from "@agent-office/domain/services/infra/log";
import { forbidInProd } from "@/lib/api-helpers";
import type { PlanetConfig, PlanetType } from "@agent-office/domain/types";

// Mirrors autoRandomPlanet() in packages/domain/src/services/projects.ts.
// Kept in-file so the route is self-contained and does not depend on an
// export that may change between planets refactors.
const PLANET_TYPES: PlanetType[] = [
  "gas-giant", "rocky", "terran", "ringed-terran", "toxic", "ice", "islands",
  "lava", "ice-moon", "eclipse", "black-hole", "galaxy", "star", "asteroid", "comet",
];

const PALETTE_COUNT_BY_TYPE: Record<PlanetType, number> = {
  "gas-giant": 6,
  "rocky": 5,
  "terran": 5,
  "ringed-terran": 5,
  "toxic": 5,
  "ice": 5,
  "islands": 5,
  "lava": 5,
  "ice-moon": 5,
  "eclipse": 5,
  "black-hole": 5,
  "galaxy": 5,
  "star": 5,
  "asteroid": 5,
  "comet": 5,
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
  const gate = forbidInProd();
  if (gate) return gate;
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
