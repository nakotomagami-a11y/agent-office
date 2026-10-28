// Single source of truth for Claude model facts: aliases, versioned id,
// display info. Was 6 hand-typed tables scattered across the app that drifted
// from each other — everything now derives from `MODEL_CATALOG`. Prices are not
// here: they come from the auto-refreshed catalog (services/providers/prices).

import type { ModelTier } from "./providers";

export interface ModelInfo {
  /** The versioned model id this alias currently resolves to. */
  fullId: string;
  label: string;
  /** Sub-line for a bare alias with no known version, e.g. "claude-sonnet-4". */
  genericSub: string;
  tier: "fast" | "smart" | "deep" | "test";
  /** CSS custom-property token for the tier badge/glow. */
  tierColorVar: string;
  /** Solid color for small swatches/dots. */
  swatchColor: string;
  /** CSS linear-gradient for bar charts. */
  gradient: string;
  /** `.an-fill-*` class defined in analytics.css. */
  fillClass: string;
  icon: string;
  description: string;
}

// No `id` field per entry — the object's own key is the id, and `ModelId`/
// `MODEL_IDS` below derive from it. One place the 4 names are spelled out.
export const MODEL_CATALOG = {
  haiku: {
    fullId: "claude-haiku-4-5", label: "Haiku", genericSub: "claude-haiku-4",
    tier: "fast", tierColorVar: "var(--green)", swatchColor: "var(--working)",
    gradient: "linear-gradient(90deg, #80e1c5, #2e8f73)", fillClass: "an-fill-haiku",
    icon: "/icons/model-haiku.png", description: "Light tasks, snappy. Good for orchestration.",
  },
  sonnet: {
    fullId: "claude-sonnet-4-6", label: "Sonnet", genericSub: "claude-sonnet-4",
    tier: "smart", tierColorVar: "var(--acc)", swatchColor: "#c792ea",
    gradient: "linear-gradient(90deg, #b6b3ff, #7a76e0)", fillClass: "an-fill-sonnet",
    icon: "/icons/model-sonnet.png", description: "Balanced — the default for most agents.",
  },
  opus: {
    fullId: "claude-opus-4-8", label: "Opus", genericSub: "claude-opus-4",
    tier: "deep", tierColorVar: "var(--amber)", swatchColor: "#ffcb6b",
    gradient: "linear-gradient(90deg, #ffd591, #f0a548)", fillClass: "an-fill-opus",
    icon: "/icons/model-opus.png", description: "Hardest reasoning. Slow. Use sparingly.",
  },
  fable: {
    fullId: "claude-fable-5", label: "Fable", genericSub: "claude-fable-5",
    tier: "test", tierColorVar: "var(--cyan)", swatchColor: "#c792ea",
    gradient: "linear-gradient(90deg, color-mix(in oklab, var(--ao-accent) 80%, white), var(--ao-accent))",
    fillClass: "an-fill-fable",
    icon: "/icons/model-fable.png", description: "Fable-5 — A/B test variant. Compare against Opus/Sonnet on the same task.",
  },
} satisfies Record<string, ModelInfo>;

export type ModelId = keyof typeof MODEL_CATALOG;

/** Runtime form of the 4 ids, in catalog order. */
export const MODEL_IDS: readonly ModelId[] = Object.keys(MODEL_CATALOG) as ModelId[];

/** Alias → current full versioned id. */
export const MODEL_FULL: Record<ModelId, string> = Object.fromEntries(
  MODEL_IDS.map((id) => [id, MODEL_CATALOG[id].fullId]),
) as Record<ModelId, string>;

/** A retired full id still valid in old `runs.model` data, but not offered
 *  as an option. Update when a catalog entry's `fullId` moves on. */
const LEGACY_OPUS_ID = "claude-opus-4-7";

/** Every string `--model` / `runs.model` may legitimately be. Explicit list
 *  (not derived) because its order drives a dropdown's item order. */
export const MODEL_OPTS = [
  "haiku", "sonnet", "opus", "fable",
  MODEL_CATALOG.opus.fullId, LEGACY_OPUS_ID,
  MODEL_CATALOG.sonnet.fullId, MODEL_CATALOG.haiku.fullId, MODEL_CATALOG.fable.fullId,
] as const;

/** A lookup result: `ModelInfo` plus the id it was found under — attached at
 *  read time, not stored, so the catalog never restates its own key. */
export type ModelMatch = ModelInfo & { id: ModelId };

/** Exact bare alias only ("haiku"/"sonnet"/"opus"/"fable") — a caller with a
 *  precise version string (e.g. "claude-opus-4-8") should keep that
 *  precision rather than collapse to the catalog's generic display. */
export function resolveModelAlias(raw: string | undefined | null): ModelMatch | null {
  if (!raw) return null;
  const id = raw.toLowerCase();
  return id in MODEL_CATALOG ? { id: id as ModelId, ...MODEL_CATALOG[id as ModelId] } : null;
}

/** Exact alias or full-id match (case-insensitive), no substring matching.
 *  For a historical/arbitrary versioned id, use `familyOf` instead. */
export function resolveModel(raw: string | undefined | null): ModelMatch | null {
  if (!raw) return null;
  const id = raw.toLowerCase();
  for (const [key, info] of Object.entries(MODEL_CATALOG)) {
    if (id === key || id === info.fullId.toLowerCase()) return { id: key as ModelId, ...info };
  }
  return null;
}

/** Classify any model string — bare alias, full id, or historical versioned
 *  id — into a family by substring. Null on no match; each caller picks its
 *  own fallback (see `tierOf`, `modelBarGradient`, `modelFamily`). */
export function familyOf(raw: string | undefined | null): ModelMatch | null {
  const exact = resolveModel(raw);
  if (exact) return exact;
  if (!raw) return null;
  const id = raw.toLowerCase();
  for (const modelId of MODEL_IDS) {
    if (id.includes(modelId)) return { id: modelId, ...MODEL_CATALOG[modelId] };
  }
  return null;
}

/** The provider tier a model runs as. Fable has no third-party counterpart, so it runs as opus. */
export function tierOf(raw: string | undefined | null): ModelTier | null {
  const id = familyOf(raw)?.id;
  return id === "fable" ? "opus" : (id ?? null);
}
