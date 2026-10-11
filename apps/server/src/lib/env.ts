import { z } from "zod";

/**
 * Runtime environment schema.
 *
 * Parsed once at server startup by `boot.ts`. Never do
 * `process.env.XXX` directly — go through `env` from this module so the
 * app fails-fast at boot instead of surfacing a `undefined` deep in a
 * request handler.
 *
 * All fields are optional with documented defaults. Claude credentials are
 * not read here: `claude` uses its own sign-in (or ANTHROPIC_API_KEY, which
 * it inherits from this process's environment).
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  /** Optional override for the bundled starter-data directory. */
  AGENT_OFFICE_STARTER_DATA: z.string().optional(),

  /** Optional override for the docs source directory. */
  AGENT_OFFICE_DOCS_DIR: z.string().optional(),

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
 * immediately — no server, embedded or standalone, starts with a bad config.
 *
 * In client-side code this evaluates against a (mostly empty)
 * `process.env` — that's fine because none of the required fields
 * exist client-side and every optional field is `.optional()`.
 */
export const env = parseEnv(
  (typeof process !== "undefined" ? process.env : {}) as NodeJS.ProcessEnv,
);

/** Startup diagnostics, called once the server initializes: warns about dev-only settings left on. Never throws. */
export function logEnvDiagnostics(): void {
  if (env.AO_DEBUG_TOOLS && env.NODE_ENV === "production") {
    console.warn(
      "[env] AO_DEBUG_TOOLS is enabled in production — this is a dev-only signal. Consider unsetting it.",
    );
  }
}
