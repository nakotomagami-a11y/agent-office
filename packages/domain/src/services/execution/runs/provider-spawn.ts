// Everything a `claude` spawn needs from the chosen AI provider, or the reason it must not start.
// Strict: an unavailable provider refuses the spawn; nothing falls back to another one.

import { usesGateway, type CostBasis, type Provider, type ProviderStatusReason } from "../../../config/providers";
import { appBaseUrl } from "../../infra/discovery";
import { peekHealth } from "../../infra/health";
import { CLAUDE_DIR } from "../../infra/paths";
import { currentProvider } from "../../providers/current";
import { buildSettingsPin, type ProviderEnvInput } from "../../providers/env";
import { issueGatewayToken, revokeGatewayTokens } from "../../providers/gateway-tokens";
import { discoverBackendEnvNames, removePinFile, writePinFile } from "../../providers/pin-file";
import { readProvider } from "../../providers/store";
import { resolveSpawnEnv } from "./spawn-env";
import type { StartRunOpts } from "./types";

const COST_BASIS: Record<Provider, CostBasis> = {
  subscription: "notional",
  anthropic_api: "billed",
  openai: "unknown",
  local: "free",
};

export interface ProviderSpawn {
  ok: true;
  provider: Provider;
  costBasis: CostBasis;
  env: NodeJS.ProcessEnv;
  accountId: string | undefined;
  secretValues: string[];
  /** `--settings <pin>` first, so a caller's trailing `-- <prompt>` stays last. */
  args: string[];
  pinFile: string;
}

export interface ProviderRefusal {
  ok: false;
  provider: Provider | null;
  reason: ProviderStatusReason;
  detail?: string;
}

const BUDGET_FLAG = "--max-budget-usd";

function withoutBudget(args: string[]): string[] {
  const at = args.indexOf(BUDGET_FLAG);
  return at === -1 ? args : [...args.slice(0, at), ...args.slice(at + 2)];
}

/** A cap the CLI would enforce on its own list-price guess is no cap at all for a non-Claude model. */
function budgetArgs(provider: Provider, args: string[]): string[] | null {
  if (!args.includes(BUDGET_FLAG)) return args;
  if (provider === "openai") return null;
  return provider === "local" ? withoutBudget(args) : args;
}

/** `ownerId` names the gateway token, revoked by `releaseProviderSpawn`. */
export function prepareProviderSpawn(ownerId: string, opts: StartRunOpts): ProviderSpawn | ProviderRefusal {
  const resolved = currentProvider();
  if (peekHealth()?.available === false) return { ok: false, provider: resolved.provider, reason: "cli_missing" };
  if (!resolved.available || !resolved.provider) {
    return { ok: false, provider: resolved.provider, reason: resolved.reason ?? "not_configured", detail: resolved.detail };
  }
  const provider = resolved.provider;
  const args = budgetArgs(provider, opts.args);
  if (!args) return { ok: false, provider, reason: "budget_unenforceable" };

  const input: ProviderEnvInput = { provider };
  if (usesGateway(provider)) {
    input.gatewayUrl = `${appBaseUrl()}/api/gateway`;
    input.token = issueGatewayToken(ownerId, provider);
    input.models = readProvider(provider)?.config?.models;
  }
  try {
    const { env, accountId, secretValues } = resolveSpawnEnv(opts, input);
    if (input.token) secretValues.push(input.token);
    const pinFile = writePinFile(buildSettingsPin(input, discoverBackendEnvNames(opts.cwd, env.CLAUDE_CONFIG_DIR ?? CLAUDE_DIR)));
    return {
      ok: true, provider, costBasis: COST_BASIS[provider], env, accountId, secretValues,
      args: ["--settings", pinFile, ...args], pinFile,
    };
  } catch (err) {
    revokeGatewayTokens(ownerId);
    throw err;
  }
}

/** A caller outside `startRun` (the context-cost probe) that the provider refused. */
export class ProviderUnavailableError extends Error {
  readonly code = "provider_unavailable";
  constructor(readonly reason: ProviderStatusReason) {
    super(`provider_unavailable: ${reason}`);
  }
}

export function releaseProviderSpawn(ownerId: string, pinFile: string | undefined): void {
  revokeGatewayTokens(ownerId);
  removePinFile(pinFile);
}
