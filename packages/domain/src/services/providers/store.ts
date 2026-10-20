// Provider config, keys and the selection, in SQLite (v28). A key is bound to the normalized URL it
// was saved for and is only ever handed out for that URL (docs/architecture.md, "AI providers").

import { isModelTier, type ModelTier } from "../../config/providers";
import type { Provider, ProviderConfig, ProviderModels } from "../../types/index";
import { getDb } from "../db/connection";
import { log } from "../infra/log";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "../accounts/secret-crypto";
import { keyTargetUrl, normalizeBaseUrl } from "./urls";

interface ConfigRow {
  config: string;
  secret: string | null;
  secret_base_url: string | null;
  updated_at: number;
}

export interface StoredProvider {
  /** null: the stored JSON is not a valid config. */
  config: ProviderConfig | null;
  hasKey: boolean;
  keyBaseUrl: string | null;
  updatedAt: number;
}

export type KeyState = "present" | "missing" | "unreadable";
export type KeyRead = { ok: true; key: string } | { ok: false; reason: "key_missing" | "key_unreadable" };

function parseModels(raw: unknown): ProviderModels | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: ProviderModels = {};
  for (const [tier, model] of Object.entries(raw)) {
    if (!isModelTier(tier) || typeof model !== "string" || !model) return null;
    out[tier] = model;
  }
  return out;
}

export function parseProviderConfig(json: string): ProviderConfig | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: ProviderConfig = {};
  if ("baseUrl" in raw && raw.baseUrl !== undefined) {
    if (typeof raw.baseUrl !== "string" || !normalizeBaseUrl(raw.baseUrl)) return null;
    out.baseUrl = raw.baseUrl;
  }
  if ("models" in raw && raw.models !== undefined) {
    const models = parseModels(raw.models);
    if (!models) return null;
    out.models = models;
  }
  return out;
}

function readRow(provider: Provider): ConfigRow | undefined {
  return getDb()
    .prepare("SELECT config, secret, secret_base_url, updated_at FROM provider_configs WHERE provider = ?")
    .get(provider) as ConfigRow | undefined;
}

export function readProvider(provider: Provider): StoredProvider | undefined {
  const row = readRow(provider);
  if (!row) return undefined;
  return { config: parseProviderConfig(row.config), hasKey: !!row.secret, keyBaseUrl: row.secret_base_url, updatedAt: row.updated_at };
}

function decrypt(stored: string | null): KeyRead {
  if (!stored) return { ok: false, reason: "key_missing" };
  if (!isEncryptedSecret(stored)) return { ok: false, reason: "key_unreadable" };
  try {
    return { ok: true, key: decryptSecret(stored) };
  } catch {
    return { ok: false, reason: "key_unreadable" };
  }
}

/** The stored key, only when `forUrl` is the URL it was saved for. */
export function readProviderKey(provider: Provider, forUrl: string): KeyRead {
  const row = readRow(provider);
  const target = normalizeBaseUrl(forUrl);
  if (!row?.secret || !target || row.secret_base_url !== target) return { ok: false, reason: "key_missing" };
  return decrypt(row.secret);
}

export function keyState(provider: Provider): KeyState {
  const read = decrypt(readRow(provider)?.secret ?? null);
  return read.ok ? "present" : read.reason === "key_missing" ? "missing" : "unreadable";
}

export function keyHint(provider: Provider): string | undefined {
  const read = decrypt(readRow(provider)?.secret ?? null);
  return read.ok && read.key.length >= 8 ? read.key.slice(-4) : undefined;
}

export interface ProviderConfigInput {
  /** null removes it. */
  baseUrl?: string | null;
  /** Blank or absent keeps the stored key, unless the key's URL changes. */
  apiKey?: string;
  models?: ProviderModels;
}

export type SaveResult = { ok: true } | { ok: false; reason: "base_url_invalid" | "invalid_config" };

function nextConfig(current: ProviderConfig, input: ProviderConfigInput): ProviderConfig | null {
  const next: ProviderConfig = { ...current };
  if (input.baseUrl === null) delete next.baseUrl;
  else if (input.baseUrl !== undefined) {
    const url = normalizeBaseUrl(input.baseUrl);
    if (!url) return null;
    next.baseUrl = url;
  }
  if (input.models) next.models = { ...current.models, ...input.models };
  return next;
}

/** A key whose target URL changes is cleared unless this same save carries a new one. */
export function saveProviderConfig(provider: Provider, input: ProviderConfigInput): SaveResult {
  if (provider === "subscription" || (provider === "anthropic_api" && input.baseUrl !== undefined)) {
    return { ok: false, reason: "invalid_config" };
  }
  const row = readRow(provider);
  const config = nextConfig((row && parseProviderConfig(row.config)) ?? {}, input);
  if (!config) return { ok: false, reason: "base_url_invalid" };
  const target = keyTargetUrl(provider, config);
  let secret = row?.secret ?? null;
  let secretUrl = row?.secret_base_url ?? null;
  if (input.apiKey) {
    if (!target) return { ok: false, reason: "base_url_invalid" };
    secret = encryptSecret(input.apiKey);
    secretUrl = target;
  } else if (secret && secretUrl !== target) {
    secret = null;
    secretUrl = null;
  }
  getDb()
    .prepare(`INSERT INTO provider_configs (provider, config, secret, secret_base_url, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET config = excluded.config, secret = excluded.secret,
        secret_base_url = excluded.secret_base_url, updated_at = excluded.updated_at`)
    .run(provider, JSON.stringify(config), secret, secretUrl, Date.now());
  log.info("provider.config_saved", { provider, baseUrl: config.baseUrl, keyChanged: !!input.apiKey });
  return { ok: true };
}

export function deleteProviderKey(provider: Provider): void {
  getDb().prepare("UPDATE provider_configs SET secret = NULL, secret_base_url = NULL, updated_at = ? WHERE provider = ?")
    .run(Date.now(), provider);
}

export interface Selection {
  /** Unchecked: the resolver turns garbage into `invalid_config`. */
  provider: string;
  source: "chosen" | "migrated";
  changedAt: number;
}

export function getSelection(): Selection | undefined {
  const row = getDb().prepare("SELECT provider, source, changed_at FROM provider_selection WHERE id = 1").get() as
    | { provider: string; source: string; changed_at: number }
    | undefined;
  if (!row) return undefined;
  return { provider: row.provider, source: row.source === "migrated" ? "migrated" : "chosen", changedAt: row.changed_at };
}

export function setSelection(provider: Provider, source: Selection["source"]): void {
  const before = getSelection()?.provider ?? null;
  getDb()
    .prepare(`INSERT INTO provider_selection (id, provider, source, changed_at) VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET provider = excluded.provider, source = excluded.source, changed_at = excluded.changed_at`)
    .run(provider, source, Date.now());
  log.warn("provider.changed", { before, after: provider, source });
}

/** Never overwrites a row that exists: the migration must not undo a choice. */
export function insertSelectionIfAbsent(provider: Provider, source: Selection["source"]): void {
  getDb()
    .prepare("INSERT OR IGNORE INTO provider_selection (id, provider, source, changed_at) VALUES (1, ?, ?, ?)")
    .run(provider, source, Date.now());
}

export const mappedTiers = (config: ProviderConfig | null): ModelTier[] =>
  Object.keys(config?.models ?? {}).filter(isModelTier);
