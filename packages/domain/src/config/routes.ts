/**
 * External URLs - never hardcode one anywhere else. The app's own paths live
 * with their owners: API paths in `@agent-office/api-contract`, UI pages in
 * `apps/web/src/lib/page-routes.ts`.
 */

/** This app's own GitHub repo ("owner/name") — the release / self-update source. */
export const APP_REPO = "nakotomagami-a11y/agent-office";

/**
 * External endpoints (git registries, release feeds, etc). When new external
 * integrations are added, define their builders here — never hardcode a URL in
 * a feature file. Builders take a combined `"owner/repo"` source string.
 */
export const EXTERNAL_API = {
  github: {
    /** Recursive file tree of a repo at a ref. */
    gitTree: (source: string, ref: string) =>
      `https://api.github.com/repos/${source}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    /** Raw file contents at a ref. */
    rawFile: (source: string, ref: string, path: string) =>
      `https://raw.githubusercontent.com/${source}/${ref}/${path}`,
    /** Latest release — JSON API. */
    latestReleaseApi: (repo: string) =>
      `https://api.github.com/repos/${repo}/releases/latest`,
    /** Latest release — human-facing page. */
    latestReleasePage: (repo: string) =>
      `https://github.com/${repo}/releases/latest`,
  },
} as const;

/** External links opened in the user's browser (not fetched). */
export const EXTERNAL_LINKS = {
  claudeUsage: "https://claude.ai/settings/usage",
} as const;
