import type { CostBasis, ModelTier, Provider, ProviderStatusReason } from "../config/providers";

export type { CostBasis, ModelTier, Provider, ProviderStatusReason };

export type ProviderModels = Partial<Record<ModelTier, string>>;

/** Non-secret provider settings. The key lives apart from this, encrypted. */
export interface ProviderConfig {
  baseUrl?: string;
  models?: ProviderModels;
}

export interface ProviderStatus {
  available: boolean;
  reason?: ProviderStatusReason;
  detail?: string;
  /** Absent: never probed. Presence checks alone never set it. */
  checkedAt?: number;
}

export interface ProviderCapabilities {
  accounts: boolean;
  plan: boolean;
  effort: boolean;
  costKnown: boolean;
  rateLimitWindow: boolean;
  resume: boolean;
  tools: boolean;
}

export interface ProviderView {
  id: Provider;
  configured: boolean;
  /** A key is stored, of any length. */
  hasKey: boolean;
  /** Last 4 characters of a stored key of 16+ characters; never more. */
  keyHint?: string;
  config: ProviderConfig;
  status: ProviderStatus;
  capabilities: ProviderCapabilities;
  priceTableDate?: number;
}

export interface CliStatus {
  available: boolean;
  version?: string;
  checkedAt?: number;
}

/** GET /api/providers. Makes no network call. */
export interface ProvidersResponse {
  selected: Provider | null;
  source?: "chosen" | "migrated";
  changedAt?: number;
  needsSetup: boolean;
  cli: CliStatus;
  providers: ProviderView[];
}

export interface ProviderTestResult {
  ok: boolean;
  reason?: ProviderStatusReason;
  detail?: string;
  latencyMs: number;
  availableModels?: string[];
}

export interface ModelPrice {
  provider: "openai" | "anthropic";
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok?: number;
  cacheWritePerMTok?: number;
}

/** GET /api/model-prices. */
export interface ModelPricesResponse {
  source: "litellm" | "openrouter" | null;
  fetchedAt: number | null;
  stale: boolean;
  entries: Record<string, ModelPrice>;
}
