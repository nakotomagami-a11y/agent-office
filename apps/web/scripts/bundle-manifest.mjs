/** Files from repo `scripts/` that the RUNNING APP needs. Spawned by path at
 *  runtime, so absence is invisible until a user hits the feature — the
 *  permission bridge shipped missing for exactly that reason. */
export const REQUIRED_BUNDLE_SCRIPTS = ["mcp-permission-server.mjs"];

/** Env var the launcher sets so the bundled server can find the above. Must
 *  survive webpack as a live read; if it constant-folds the fix is a no-op. */
/** Docs the RUNNING APP reads: the Loop resolves reviewer rule citations
 *  against conventions.md, and an unresolvable citation fails a whole batch. */
export const REQUIRED_BUNDLE_DOCS = ["conventions.md"];

export const BUNDLE_ROOT_ENV = "AO_BUNDLE_ROOT";
