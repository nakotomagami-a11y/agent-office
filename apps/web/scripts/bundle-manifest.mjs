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

/** Build-time junk that `next build` copies into `.next/standalone`, relative
 *  to the bundle root. `cache` is the webpack/ISR cache and `dev` is
 *  dev-server output; the production server reads neither, and together they
 *  were ~2GB of a 2.1GB payload — a 913MB .deb for a 170MiB app. Both are
 *  recreated on demand if anything ever wants them. */
export const EXCLUDED_BUNDLE_PATHS = [
  ["apps", "web", ".next", "cache"],
  ["apps", "web", ".next", "dev"],
  // The Tauri crate itself. Next's file tracing walks the app directory and
  // drags `src-tauri` into the standalone output — including `target/`, which
  // is multi-GB once a release build has run, and `server/`, which is the
  // previous copy of this very bundle. Nothing under it is read at runtime:
  // the launcher passes AO_BUNDLE_ROOT, and scripts/ and docs/ are copied
  // explicitly. At 2.2GB it pushed makensis past its address space and the
  // installer stage died with "Internal compiler error #12345: error mmapping
  // datablock", which reads like a corrupt build rather than an oversized one.
  ["apps", "web", "src-tauri"],
];
