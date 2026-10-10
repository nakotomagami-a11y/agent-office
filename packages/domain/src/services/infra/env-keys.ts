// Windows looks environment variables up case-insensitively, so removing `GH_TOKEN`
// from a spawn env must also remove an inherited `Gh_Token`.
export function deleteEnvKeys(env: NodeJS.ProcessEnv, names: readonly string[]): void {
  const lower = new Set(names.map((n) => n.toLowerCase()));
  for (const key of Object.keys(env)) if (lower.has(key.toLowerCase())) delete env[key];
}

/** gh ranks these above GH_CONFIG_DIR: an inherited one would override the project's GitHub account. */
export const GH_TOKEN_VARS = ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"] as const;
