// Per-run bearer tokens: the only credential a gateway-provider child ever holds. A token lives as
// long as its run (the missing-session respawn included) and dies with this process. The map hangs
// off globalThis, like the live-run registry, so the Next-embedded route sees what the spawner wrote.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Provider } from "../../types/index";

interface TokenEntry {
  digest: Buffer;
  ownerId: string;
  provider: Provider;
  /** The run's `--max-budget-usd`, enforced here because the CLI prices only Claude models. */
  budgetUsd?: number;
  spentUsd: number;
  /** The worst case of calls still in flight. */
  reservedUsd: number;
  /** A response whose model had no catalog price: the run's cost is unknown. */
  unpriced: boolean;
}

declare global {
  var __agentOfficeGatewayTokens: Map<string, TokenEntry> | undefined;
}

const tokens: Map<string, TokenEntry> =
  globalThis.__agentOfficeGatewayTokens ?? (globalThis.__agentOfficeGatewayTokens = new Map());

const digestOf = (token: string): Buffer => createHash("sha256").update(token).digest();

export function issueGatewayToken(ownerId: string, provider: Provider, budgetUsd?: number): string {
  const token = randomBytes(32).toString("base64url");
  const digest = digestOf(token);
  tokens.set(digest.toString("hex"), { digest, ownerId, provider, budgetUsd, spentUsd: 0, reservedUsd: 0, unpriced: false });
  return token;
}

export function revokeGatewayTokens(ownerId: string): void {
  for (const [key, entry] of tokens) if (entry.ownerId === ownerId) tokens.delete(key);
}

export function lookupGatewayToken(token: string): { ownerId: string; provider: Provider } | null {
  const digest = digestOf(token);
  const entry = tokens.get(digest.toString("hex"));
  if (!entry || !timingSafeEqual(entry.digest, digest)) return null;
  return { ownerId: entry.ownerId, provider: entry.provider };
}

const entryOf = (ownerId: string): TokenEntry | undefined => [...tokens.values()].find((e) => e.ownerId === ownerId);

/** `null`: the response's model has no price. */
export function chargeGatewayRun(ownerId: string, usd: number | null): void {
  const entry = entryOf(ownerId);
  if (!entry) return;
  if (usd === null) entry.unpriced = true;
  else entry.spentUsd += usd;
}

export function reserveGatewayRun(ownerId: string, usd: number): void {
  const entry = entryOf(ownerId);
  if (entry) entry.reservedUsd = Math.max(0, entry.reservedUsd + usd);
}

export function gatewaySpend(ownerId: string): { spentUsd: number; reservedUsd: number; unpriced: boolean; budgetUsd?: number } | null {
  const entry = entryOf(ownerId);
  return entry ? { spentUsd: entry.spentUsd, reservedUsd: entry.reservedUsd, unpriced: entry.unpriced, budgetUsd: entry.budgetUsd } : null;
}
