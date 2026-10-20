// The last probe per provider, kept 60 s so the 30 s health poll and GET /api/providers never touch
// the network; and the real probe dependencies (fetch, `claude auth status`).

import type { Provider, ProviderStatus } from "../../types/index";
import { PROVIDER_PROBE_TIMEOUT_MS } from "../../config/providers";
import { spawnClaude } from "../infra/claude-bin";
import { buildAugmentedPath, CLAUDE_DIR } from "../infra/paths";
import { scrubBackendEnv } from "./env";
import type { ProbeDeps } from "./status";

const TTL_MS = 60_000;

declare global {
  var __agentOfficeProviderStatus: Map<Provider, ProviderStatus> | undefined;
}

const cache: Map<Provider, ProviderStatus> =
  globalThis.__agentOfficeProviderStatus ?? (globalThis.__agentOfficeProviderStatus = new Map());

export function cachedStatus(provider: Provider, now = Date.now()): ProviderStatus | undefined {
  const hit = cache.get(provider);
  return hit?.checkedAt !== undefined && now - hit.checkedAt < TTL_MS ? hit : undefined;
}

export const rememberStatus = (provider: Provider, status: ProviderStatus): void => void cache.set(provider, status);
export const forgetStatus = (provider: Provider): void => void cache.delete(provider);

/** `claude auth status --json` for the default account, with no inherited backend env. */
export function authStatus(configDir: string = CLAUDE_DIR): Promise<unknown> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CONFIG_DIR: configDir, PATH: buildAugmentedPath() };
    scrubBackendEnv(env);
    let out = "";
    let proc: ReturnType<typeof spawnClaude>;
    try {
      proc = spawnClaude(["auth", "status", "--json"], { env, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return resolve(null);
    }
    const timer = setTimeout(() => proc.kill(), PROVIDER_PROBE_TIMEOUT_MS);
    proc.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("error", () => { clearTimeout(timer); resolve(null); });
    proc.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(out) as unknown);
      } catch {
        resolve(null);
      }
    });
  });
}

export const defaultProbeDeps = (): ProbeDeps => ({ fetch, authStatus: () => authStatus() });
