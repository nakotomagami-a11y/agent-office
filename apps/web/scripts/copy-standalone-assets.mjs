/**
 * Runs after `next build`. Next's `output: "standalone"` build does not copy
 * `.next/static` or `public/` into `.next/standalone` itself (documented
 * Next.js behavior) — without this, `node .next/standalone/apps/web/server.js`
 * boots but 404s on every asset. `prepare-bundle.mjs` does the same copy for
 * the Tauri desktop bundle; this is the equivalent for a plain `pnpm start`.
 */
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const standaloneAppDir = join(appRoot, ".next", "standalone", "apps", "web");

if (!existsSync(standaloneAppDir)) {
  console.error("copy-standalone-assets: .next/standalone/apps/web not found — did `next build` run?");
  process.exit(1);
}

cpSync(join(appRoot, ".next", "static"), join(standaloneAppDir, ".next", "static"), { recursive: true });

const publicDir = join(appRoot, "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, join(standaloneAppDir, "public"), { recursive: true });
}

console.log("copy-standalone-assets: done");
