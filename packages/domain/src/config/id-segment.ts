// Lives in config/, not services/infra/paths.ts, so packages/api-contract can
// import it: a request schema and the service it feeds must agree on what a
// path segment is. They did not — `skillInstallSchema` spelled the charset out
// as `/^[A-Za-z0-9._-]+$/`, which accepts `..`, and `installSkill` trusted it.

// Charset only: `..` and a leading `.` match it. Deliberately NOT exported —
// a copy of exactly this regex, used as if it were the validator, is the bug.
const ID_SEGMENT_CHARS = /^[A-Za-z0-9._-]+$/;

const ID_SEGMENT_MAX = 128;

/**
 * Strict validator for URL `:id` / `:name` segments that flow into `path.join`.
 * Rejects path separators, traversal, leading dots and oversized names — the
 * route should respond 400 instead of silently transforming the value.
 */
export function isValidIdSegment(name: string): boolean {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.length > ID_SEGMENT_MAX) return false;
  if (name.startsWith(".")) return false;
  return ID_SEGMENT_CHARS.test(name);
}
