// Single source of truth for the app version.
//
// `apps/web/package.json` is canonical: it is what actually drives the shipped
// build. `apps/web/src-tauri/tauri.conf.json` reads it via `"version":
// "../package.json"` (→ runtime `getVersion()` + the .deb/.AppImage bundle
// version), and `apps/web/next.config.mjs` requires it for
// `NEXT_PUBLIC_APP_VERSION`. Cargo.toml's version is NOT used for the app
// version (it sat at 0.0.4 across several 0.0.x releases with no effect) and
// the root package.json version is unused at runtime — both are only synced
// here so a human reading them is never misled.
//
// Usage: node scripts/set-version.mjs <version>   e.g. 0.1.0
// Run from anywhere; paths resolve relative to the repo root.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`set-version: expected a semver like 0.1.0, got: ${version ?? "(nothing)"}`);
  process.exit(1);
}

/** Rewrite the top-level `"version"` field of a package.json, preserving formatting. */
function bumpPackageJson(relPath, { canonical = false } = {}) {
  const file = join(root, relPath);
  const src = readFileSync(file, "utf8");
  const next = src.replace(/^(\s*"version"\s*:\s*")[^"]*(")/m, `$1${version}$2`);
  if (next === src) throw new Error(`set-version: no "version" field found in ${relPath}`);
  writeFileSync(file, next);
  console.log(`  ${canonical ? "★" : " "} ${relPath} → ${version}`);
}

/** Rewrite the `[package]` version in Cargo.toml — the first `version = "…"`,
 *  which is the package version (tables below it are [dependencies] etc.). */
function bumpCargoToml(relPath) {
  const file = join(root, relPath);
  const src = readFileSync(file, "utf8");
  const next = src.replace(/^version = "[^"]*"$/m, `version = "${version}"`);
  if (next === src) throw new Error(`set-version: no package version found in ${relPath}`);
  writeFileSync(file, next);
  console.log(`    ${relPath} → ${version}`);
}

/** Keep the `app` crate entry in Cargo.lock in step so CI doesn't rebuild
 *  against a dirty lockfile. Scoped to the `name = "app"` stanza only. */
function bumpCargoLock(relPath) {
  const file = join(root, relPath);
  const src = readFileSync(file, "utf8");
  const next = src.replace(/(name = "app"\nversion = ")[^"]*(")/, `$1${version}$2`);
  if (next === src) throw new Error(`set-version: no "app" crate entry found in ${relPath}`);
  writeFileSync(file, next);
  console.log(`    ${relPath} → ${version}`);
}

console.log(`Setting version ${version} (★ = canonical source):`);
bumpPackageJson("apps/web/package.json", { canonical: true });
bumpPackageJson("package.json");
bumpCargoToml("apps/web/src-tauri/Cargo.toml");
bumpCargoLock("apps/web/src-tauri/Cargo.lock");
console.log("Done. Commit these together, then tag v" + version + " to release.");
