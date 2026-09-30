/**
 * Post-bundle gate. The permission bridge was absent from the packaged app
 * while every unit test, typecheck and lint passed, because no check ever
 * looked at the artifact. This looks at the artifact.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_BUNDLE_SCRIPTS, REQUIRED_BUNDLE_DOCS, BUNDLE_ROOT_ENV, EXCLUDED_BUNDLE_PATHS } from "./bundle-manifest.mjs";

const tauriDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri");
const bundleRoot = join(tauriDir, "server");
const fail = (msg) => { console.error(`verify-bundle: FATAL ${msg}`); process.exit(1); };

if (!existsSync(bundleRoot)) fail(`no bundle at ${bundleRoot} — run prepare-bundle first`);

// This gate only ever asserted that required files were PRESENT, which is why
// ~2GB of build junk shipped unnoticed for weeks. Absence is a property too.
for (const segments of EXCLUDED_BUNDLE_PATHS) {
  const rel = segments.join("/");
  if (existsSync(join(bundleRoot, ...segments))) {
    fail(`build junk present in bundle: ${rel} — prepare-bundle should have removed it`);
  }
  console.log(`verify-bundle: OK ${rel} absent`);
}

for (const name of REQUIRED_BUNDLE_SCRIPTS) {
  const p = join(bundleRoot, "scripts", name);
  if (!existsSync(p)) fail(`required script missing from bundle: ${p}`);
  console.log(`verify-bundle: OK ${name}`);
}

for (const name of REQUIRED_BUNDLE_DOCS) {
  const p = join(bundleRoot, "docs", name);
  if (!existsSync(p)) fail(`required doc missing from bundle: ${p}`);
  console.log(`verify-bundle: OK docs/${name}`);
}

// A live `process.env.X` read, not a folded constant. Webpack rewrites this
// module heavily (it inlines `env:{PROD:!0,...}` beside it), and a fold would
// silently restore the original bug.
const chunkDir = join(bundleRoot, "apps", "web", ".next", "server");
if (!existsSync(chunkDir)) fail(`no server chunks at ${chunkDir}`);
const stack = [chunkDir];
let found = 0;
while (stack.length) {
  for (const e of readdirSync(stack.pop(), { withFileTypes: true })) {
    const p = join(e.parentPath ?? e.path, e.name);
    if (e.isDirectory()) stack.push(p);
    else if (e.name.endsWith(".js") && readFileSync(p, "utf8").includes(`process.env.${BUNDLE_ROOT_ENV}`)) found++;
  }
}
if (found === 0) fail(`${BUNDLE_ROOT_ENV} did not survive webpack as a live read — the bridge path would fall back to the dev-only branch`);
console.log(`verify-bundle: OK ${BUNDLE_ROOT_ENV} live in ${found} chunk(s)`);
