// Alias → full versioned model ID. Update here when Anthropic releases new versions.
export const MODEL_FULL: Record<string, string> = {
  haiku:  "claude-haiku-4-5",
  sonnet: "claude-sonnet-4-6",
  opus:   "claude-opus-4-8",
  fable:  "claude-fable-5",
};

export const MODEL_OPTS = [
  "haiku",
  "sonnet",
  "opus",
  "fable",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "claude-fable-5",
] as const;

export const EFFORT_OPTS = ["low", "medium", "high", "xhigh", "max"] as const;
