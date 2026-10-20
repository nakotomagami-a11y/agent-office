// `claude --version` cache, 60 s: a failure must not stick, the spawn preflight refuses runs on it.

import type { HealthInfo } from "../../types/index";
import { scrubBackendEnv } from "../providers/env";
import { spawnClaude } from "./claude-bin";
import { buildAugmentedPath } from "./paths";

interface HealthState {
  cached: HealthInfo | null;
  cachedAt?: number;
  inflight: Promise<HealthInfo> | null;
}

export const HEALTH_TTL_MS = 60_000;

declare global {
  var __agentOfficeHealthState: HealthState | undefined;
}

const state: HealthState =
  globalThis.__agentOfficeHealthState ??
  (globalThis.__agentOfficeHealthState = { cached: null, inflight: null });

function probe(): Promise<HealthInfo> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    try {
      const env: NodeJS.ProcessEnv = { ...process.env, PATH: buildAugmentedPath() };
      scrubBackendEnv(env);
      const proc = spawnClaude(["--version"], { stdio: ["ignore", "pipe", "pipe"], env });
      proc.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on("error", (err) => {
        resolve({ available: false, version: null, error: String(err) });
      });
      proc.on("exit", (code) => {
        if (code === 0) {
          resolve({ available: true, version: stdout.trim() });
        } else {
          resolve({ available: false, version: null, error: stderr.trim() || `exit ${code}` });
        }
      });
    } catch (e) {
      resolve({ available: false, version: null, error: String(e) });
    }
  });
}

const fresh = (now: number): boolean => state.cachedAt !== undefined && now - state.cachedAt < HEALTH_TTL_MS;

/** The last probe if still fresh, without starting one: for synchronous callers such as the spawn preflight. */
export const peekHealth = (now = Date.now()): HealthInfo | null => (fresh(now) ? state.cached : null);

export async function getHealth(force = false): Promise<HealthInfo> {
  if (!force && state.cached && fresh(Date.now())) return state.cached;
  if (!state.inflight) {
    state.inflight = probe().then((info) => {
      state.cached = info;
      state.cachedAt = Date.now();
      state.inflight = null;
      return info;
    });
  }
  return state.inflight;
}
