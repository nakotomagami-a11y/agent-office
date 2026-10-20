// Everything a `claude` spawn needs from the chosen AI provider, or the reason it must not start.
// Strict: an unavailable provider refuses the spawn; nothing falls back to another one.

import { tierOf } from "../../../config/models";
import { usesGateway, type CostBasis, type Provider, type ProviderStatusReason } from "../../../config/providers";
import { appBaseUrl } from "../../infra/discovery";
import { peekHealth } from "../../infra/health";
import { CLAUDE_DIR } from "../../infra/paths";
import { currentProvider } from "../../providers/current";
import { buildSettingsPin, type ProviderEnvInput } from "../../providers/env";
import { gatewaySpend, issueGatewayToken, revokeGatewayTokens } from "../../providers/gateway-tokens";
import { discoverBackendEnvNames, removePinFile, writePinFile } from "../../providers/pin-file";
import { priceFor } from "../../providers/prices/catalog";
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

/** Flags come before `--`; whatever follows is the prompt, which may contain anything. */
function flagAt(args: string[], flag: string): number {
  const end = args.indexOf("--");
  return (end === -1 ? args : args.slice(0, end)).indexOf(flag);
}

/**
 * The CLI prices only Claude models, so on openai the gateway enforces the cap from catalog prices:
 * every mapped model must have one, or the cap could not hold. A local server is free.
 */
function budgetPlan(provider: Provider, args: string[]): { args: string[]; budgetUsd?: number } | null {
  const at = flagAt(args, BUDGET_FLAG);
  if (at === -1 || !usesGateway(provider)) return { args };
  const stripped = [...args.slice(0, at), ...args.slice(at + 2)];
  if (provider === "local") return { args: stripped };
  const budgetUsd = Number(args[at + 1]);
  const models = Object.values(readProvider(provider)?.config?.models ?? {}).filter((m): m is string => !!m);
  const priced = models.length > 0 && models.every((m) => priceFor(m) !== null);
  return priced && Number.isFinite(budgetUsd) && budgetUsd > 0 ? { args: stripped, budgetUsd } : null;
}

/** The CLI maps only the three tier aliases to the provider's models; a full Claude id or fable would 404. */
function tierArgs(provider: Provider, args: string[]): string[] {
  const at = flagAt(args, "--model");
  const tier = at === -1 || !usesGateway(provider) ? null : tierOf(args[at + 1]);
  return tier ? args.map((a, i) => (i === at + 1 ? tier : a)) : args;
}

/** What a run cost and what that number means. The CLI's own figure is real only for Claude models. */
export function runCost(ownerId: string, provider: Provider, cliCostUsd: number): { cost: number; costBasis: CostBasis } {
  if (provider === "subscription" || provider === "anthropic_api") return { cost: cliCostUsd, costBasis: COST_BASIS[provider] };
  const spend = provider === "openai" ? gatewaySpend(ownerId) : null;
  return spend && !spend.unpriced ? { cost: spend.spentUsd, costBasis: "estimated" } : { cost: 0, costBasis: COST_BASIS[provider] };
}

/** `ownerId` names the gateway token, revoked by `releaseProviderSpawn`. */
export function prepareProviderSpawn(ownerId: string, opts: StartRunOpts): ProviderSpawn | ProviderRefusal {
  const resolved = currentProvider();
  if (peekHealth()?.available === false) return { ok: false, provider: resolved.provider, reason: "cli_missing" };
  if (!resolved.available || !resolved.provider) {
    return { ok: false, provider: resolved.provider, reason: resolved.reason ?? "not_configured", detail: resolved.detail };
  }
  const provider = resolved.provider;
  const budget = budgetPlan(provider, opts.args);
  if (!budget) return { ok: false, provider, reason: "budget_unenforceable" };
  const args = tierArgs(provider, budget.args);

  const input: ProviderEnvInput = { provider };
  if (usesGateway(provider)) {
    input.gatewayUrl = `${appBaseUrl()}/api/gateway`;
    input.token = issueGatewayToken(ownerId, provider, budget.budgetUsd);
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
