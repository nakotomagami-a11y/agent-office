// How local clients find this server. The packaged app binds a random port each
// launch, so out-of-process clients (the Minecraft mod) read it from disk. Each
// running server owns one file, servers/<pid>.json: a single shared file let the
// last server started (or stopped) hide every other one. Readers try entries
// newest first and confirm with GET /api/health, so a stale entry is harmless.

import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./fs-atomic";
import { DISCOVERY_DIR } from "./paths";
import { isPidAlive } from "./pid";

export interface DiscoveryInfo {
  baseUrl: string;
  pid: number;
  startedAt: number;
}

/** Loopback URL of this server. Next sets PORT to the bound port before boot hooks run. */
export function appBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.AO_BASE_URL ?? `http://127.0.0.1:${env.PORT ?? "3000"}`;
}

export function discoveryFile(dir: string, pid: number): string {
  return join(dir, `${pid}.json`);
}

export function writeDiscoveryFile(dir: string = DISCOVERY_DIR, info?: Partial<DiscoveryInfo>): DiscoveryInfo {
  const full: DiscoveryInfo = {
    baseUrl: info?.baseUrl ?? appBaseUrl(),
    pid: info?.pid ?? process.pid,
    startedAt: info?.startedAt ?? Date.now(),
  };
  writeFileAtomic(discoveryFile(dir, full.pid), JSON.stringify(full, null, 2) + "\n");
  return full;
}

/** On shutdown. Best effort: a killed process never gets here, which pruneDeadServers covers. */
export function removeDiscoveryFile(dir: string = DISCOVERY_DIR, pid: number = process.pid): void {
  rmSync(discoveryFile(dir, pid), { force: true });
}

/** At boot: drop entries left by servers that were killed without running their exit hook. */
export function pruneDeadServers(dir: string = DISCOVERY_DIR, alive: (pid: number) => boolean = isPidAlive): number {
  let removed = 0;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    const match = /^(\d+)\.json$/.exec(name);
    if (!match) continue;
    const pid = Number(match[1]);
    if (pid === process.pid || alive(pid)) continue;
    rmSync(join(dir, name), { force: true });
    removed++;
  }
  return removed;
}

/** Entries newest first; unreadable or malformed files are skipped. */
export function readDiscoveryFiles(dir: string = DISCOVERY_DIR): DiscoveryInfo[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: DiscoveryInfo[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (typeof raw !== "object" || raw === null) continue;
      if (!("baseUrl" in raw) || !("pid" in raw) || !("startedAt" in raw)) continue;
      const { baseUrl, pid, startedAt } = raw;
      if (typeof baseUrl !== "string" || typeof pid !== "number" || typeof startedAt !== "number") continue;
      out.push({ baseUrl, pid, startedAt });
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}
