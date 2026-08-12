import { z } from "zod";

/**
 * Runtime environment schema.
 *
 * Parsed once at server startup by `instrumentation-node.ts`. Never do
 * `process.env.XXX` directly — go through `env` from this module so the
 * app fails-fast at boot instead of surfacing a `undefined` deep in a
 * request handler.
 *
 * All optional fields have documented defaults. Only ANTHROPIC_API_KEY
 * is truly required for the app to function — the summon subprocess
 * needs it to talk to Claude — but we surface it as a warning rather
 * than a fatal so `next build` and `next start` still work in CI
 * without keys.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  /** Anthropic Claude API key. Passed to every `claude` subprocess.
   *  Warns (does not fatal) when missing so builds work in CI.
   *  Empty strings are normalised to undefined so that ANTHROPIC_API_KEY=""
   *  (a common "clear the variable" pattern) does not cause a boot failure. */
  ANTHROPIC_API_KEY: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(1).optional(),
  ),

  /** Optional override for the bundled starter-data directory. */
  AGENT_OFFICE_STARTER_DATA: z.string().optional(),

  /** Optional override for the docs source directory. */
  AGENT_OFFICE_DOCS_DIR: z.string().optional(),

  /** Optional override for the SQLite path. */
  AGENT_OFFICE_DB_PATH: z.string().optional(),

  /** Verbose tool-call logging in the summon subprocess wrapper.
   *  Dev-only. Any non-empty value enables it. */
  AO_DEBUG_TOOLS: z.string().optional(),

  /** i18n default locale (defaults to `en`). Used by next-intl. */
  DEFAULT_LOCALE: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parse the raw environment. Returns the typed env or throws a
 * legible aggregate error if any required field is malformed. Called
 * once at server startup.
 */
export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `[env] Environment validation failed:\n${issues}\n\nAborting startup.`,
    );
  }
  return result.data;
}

/**
 * Parses at module load. If validation fails the process throws
 * immediately — Next won't start with a bad config.
 *
 * In client-side code this evaluates against a (mostly empty)
 * `process.env` — that's fine because none of the required fields
 * exist client-side and every optional field is `.optional()`.
 */
export const env = parseEnv(
  (typeof process !== "undefined" ? process.env : {}) as NodeJS.ProcessEnv,
);

/**
 * Startup diagnostics. Called by instrumentation once the server
 * initializes. Warns (via console.warn) about missing-but-not-fatal
 * config so the operator sees the state clearly. Does NOT throw.
 */
export function logEnvDiagnostics(): void {
  if (env.NODE_ENV === "production") {
    if (!env.ANTHROPIC_API_KEY) {
      console.warn(
        "[env] ANTHROPIC_API_KEY is not set. Any /api/summon request will fail until the key is configured.",
      );
    }
  }
  if (env.AO_DEBUG_TOOLS && env.NODE_ENV === "production") {
    console.warn(
      "[env] AO_DEBUG_TOOLS is enabled in production — this is a dev-only signal. Consider unsetting it.",
    );
  }
}
