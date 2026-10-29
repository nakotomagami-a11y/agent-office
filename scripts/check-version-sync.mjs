/**
 * Every place the version is written must agree with the canonical one.
 *
 * `packaging/arch/PKGBUILD` was not part of `set-version.mjs`, so `pkgver`
 * silently lagged: a bump would leave the Arch package building the PREVIOUS
 * version under a new name. The script is fixed; this is the check that keeps
 * it fixed when the next packaging target is added.
 *
 *   node scripts/check-version-sync.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const canonical = JSON.parse(read("apps/web/package.json")).version;

const found = [
  ["package.json", JSON.parse(read("package.json")).version],
  ["apps/web/src-tauri/Cargo.toml", /^version = "([^"]+)"/m.exec(read("apps/web/src-tauri/Cargo.toml"))?.[1]],
  ["packaging/arch/PKGBUILD", /^pkgver=(.+)$/m.exec(read("packaging/arch/PKGBUILD"))?.[1]?.trim()],
];

// set-version.mjs used to write `pkgrel=1`, which deletes the AO_PKGREL hook
// install-local-arch.sh needs. Nothing else looks at pkgrel, so the regression
// would only surface as a `pacman -U` that no-ops after a 4-minute build.
const PKGREL_LINE = "pkgrel=${AO_PKGREL:-1}";
if (!read("packaging/arch/PKGBUILD").includes(PKGREL_LINE)) {
  console.error(`packaging/arch/PKGBUILD must keep \`${PKGREL_LINE}\` verbatim.`);
  process.exit(1);
}

const wrong = found.filter(([, v]) => v !== canonical);
if (wrong.length > 0) {
  console.error(`version mismatch — apps/web/package.json is the canonical ${canonical}:`);
  for (const [file, v] of wrong) console.error(`  ${file}: ${v ?? "(not found)"}`);
  console.error("\nFix with: node scripts/set-version.mjs <version>");
  process.exit(1);
}
console.log(`version OK — ${canonical} across ${found.length + 1} files`);
