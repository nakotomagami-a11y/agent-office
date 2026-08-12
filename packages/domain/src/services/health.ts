// `claude --version` cache. Refreshed on demand.

import { spawn } from "node:child_process";
import type { HealthInfo } from "../types/index";
import { buildAugmentedPath } from "./paths";

interface HealthState {
  cached: HealthInfo | null;
  inflight: Promise<HealthInfo> | null;
}

declare global {
  // eslint-disable-next-line no-var
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
      const proc = spawn("claude", ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PATH: buildAugmentedPath() },
      });
      proc.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr.on("data", (chunk: Buffer) => {
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

export async function getHealth(force = false): Promise<HealthInfo> {
  if (!force && state.cached) return state.cached;
  if (!state.inflight) {
    state.inflight = probe().then((info) => {
      state.cached = info;
      state.inflight = null;
      return info;
    });
  }
  return state.inflight;
}
