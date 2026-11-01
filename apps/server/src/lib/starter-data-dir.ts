import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { env } from "./env";

/** Locate the bundled starter-data dir across dev/build/env layouts. */
export function resolveStarterDataDir(): string | null {
  const candidates = [
    env.AGENT_OFFICE_STARTER_DATA,
    join(process.cwd(), "starter-data"),
    join(process.cwd(), "apps", "web", "starter-data"),
  ].filter((c): c is string => !!c);
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isDirectory()) return c;
    } catch {
      /* keep trying */
    }
  }
  return null;
}
