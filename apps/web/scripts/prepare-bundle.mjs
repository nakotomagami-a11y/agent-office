/**
 * Runs after `next build` to assemble the Tauri resource bundle.
 *
 * Outputs:
 *   src-tauri/server/   ← Next.js standalone server + static/public assets
 *   src-tauri/binaries/node-<triple>[.exe]  ← this Node.js binary
 */

import { copyFileSync, mkdirSync, cpSync, rmSync, readdirSync, existsSync, chmodSync, realpathSync, readlinkSync, lstatSync } from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, arch } from "node:os";

console.log("prepare-bundle: starting, cwd =", process.cwd());
console.log("prepare-bundle: platform =", platform(), arch());
console.log("prepare-bundle: node =", process.version);

function getTauriTargetTriple() {
  const p = platform();
  const a = arch();
  if (p === "linux"  && a === "x64")   return "x86_64-unknown-linux-gnu";
  if (p === "linux"  && a === "arm64") return "aarch64-unknown-linux-gnu";
  if (p === "darwin" && a === "arm64") return "aarch64-apple-darwin";
  if (p === "darwin" && a === "x64")   return "x86_64-apple-darwin";
  if (p === "win32"  && a === "x64")   return "x86_64-pc-windows-msvc";
  throw new Error(`Unsupported platform: ${p} ${a}`);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, ".."); // apps/web/
const tauriDir = join(appRoot, "src-tauri");
const workspaceRoot = join(appRoot, "..", "..");

const standaloneDir = join(appRoot, ".next", "standalone");
if (!existsSync(standaloneDir)) {
  console.error("ERROR: .next/standalone not found");
  process.exit(1);
}

// Enumerate and diagnose each top-level entry in standalone
console.log("\n=== standalone top-level entries ===");
const topEntries = readdirSync(standaloneDir, { withFileTypes: true });
for (const e of topEntries) {
  const p = join(standaloneDir, e.name);
  const flags = [
    e.isDirectory() ? "dir" : "",
    e.isFile() ? "file" : "",
    e.isSymbolicLink() ? "symlink" : "",
  ].filter(Boolean).join("+");

  let realStr = "";
  try {
    const rp = realpathSync(p);
    // Truncate long paths for readability
    realStr = rp.length > 80 ? "..." + rp.slice(-77) : rp;
  } catch (err) {
    realStr = `[realpathSync FAIL: ${err.code}]`;
  }
  console.log(`  ${e.name} [${flags}] -> ${realStr}`);
}
console.log("=== end ===\n");

// Check standalone/node_modules specifically
const standaloneNM = join(standaloneDir, "node_modules");
const workspaceNM = join(workspaceRoot, "node_modules");
if (existsSync(standaloneNM)) {
  let realNM = null;
  try { realNM = realpathSync(standaloneNM); } catch (e) { realNM = `[FAIL: ${e.code}]`; }
  console.log("standalone/node_modules realpath:", realNM);
  console.log("workspace/node_modules path:    ", workspaceNM);
  const isJunctionToWorkspace = realNM === workspaceNM;
  console.log("isJunctionToWorkspace:", isJunctionToWorkspace, "\n");
}

// Also check standalone/apps/web/node_modules — on Windows this is often an
// NTFS junction back to the workspace node_modules, causing cpSync to recurse
// into the full pnpm virtual store and crash at the C level.
const standaloneAppWebNM = join(standaloneDir, "apps", "web", "node_modules");
if (existsSync(standaloneAppWebNM)) {
  let appWebNMStat = null;
  let appWebNMReal = null;
  try { appWebNMStat = lstatSync(standaloneAppWebNM); } catch (e) { /* ignore */ }
  try { appWebNMReal = realpathSync(standaloneAppWebNM); } catch (e) { appWebNMReal = `[FAIL: ${e.code}]`; }
  const isJunction = appWebNMStat?.isSymbolicLink() ?? false;
  console.log("standalone/apps/web/node_modules isSymlink/junction:", isJunction);
  console.log("standalone/apps/web/node_modules realpath:", appWebNMReal, "\n");
}

/**
 * JS-level recursive copy that dereferences symlinks/junctions safely.
 * cpSync(dereference:true) uses C-level recursion and crashes on Windows when
 * it follows an NTFS junction into the deep pnpm virtual store (C stack
 * overflow). This version uses JS recursion with a cycle-detection stack.
 */
function safeCpSync(src, dest, _stack = new Set()) {
  let srcStat;
  try {
    srcStat = lstatSync(src);
  } catch (err) {
    console.warn(`    WARN: cannot stat ${src}: ${err.message}`);
    return;
  }

  if (srcStat.isSymbolicLink()) {
    let realSrc;
    try {
      realSrc = realpathSync(src);
    } catch {
      // realpathSync traverses the full junction chain and hits EPERM when any
      // hop points through a protected Windows path. Fall back to readlinkSync
      // which reads only the immediate reparse-point target (one hop).
      try {
        let link = readlinkSync(src);
        if (!isAbsolute(link)) link = join(dirname(src), link);
        // Strip Windows internal \??\ namespace prefix if present.
        realSrc = link.replace(/^\\\?\?\\/, "");
      } catch (err2) {
        console.warn(`    WARN: cannot resolve symlink ${src}: ${err2.message}`);
        return;
      }
    }
    if (_stack.has(realSrc)) {
      console.warn(`    WARN: circular junction ${src} -> ${realSrc}, skipping`);
      return;
    }
    safeCpSync(realSrc, dest, _stack);
    return;
  }

  if (srcStat.isDirectory()) {
    let realSrc;
    try { realSrc = realpathSync(src); } catch { realSrc = src; }
    if (_stack.has(realSrc)) {
      console.warn(`    WARN: circular dir ref ${src}, skipping`);
      return;
    }
    mkdirSync(dest, { recursive: true });
    _stack.add(realSrc);
    let entries;
    try {
      entries = readdirSync(src, { withFileTypes: true });
    } catch (err) {
      console.warn(`    WARN: cannot readdir ${src}: ${err.message}`);
      _stack.delete(realSrc);
      return;
    }
    for (const entry of entries) {
      safeCpSync(join(src, entry.name), join(dest, entry.name), _stack);
    }
    _stack.delete(realSrc);
    return;
  }

  if (srcStat.isFile()) {
    try {
      copyFileSync(src, dest);
    } catch (err) {
      console.warn(`    WARN: cannot copy file ${src}: ${err.message}`);
    }
  }
}

try {
  const serverDestDir = join(tauriDir, "server");
  if (existsSync(serverDestDir)) {
    rmSync(serverDestDir, { recursive: true, force: true });
  }

  // 1. Copy each top-level entry of standalone individually so we can
  //    isolate any entry that crashes the process.
  console.log("prepare-bundle: copying standalone top-level entries one by one...");
  for (const entry of topEntries) {
    const src = join(standaloneDir, entry.name);
    const dest = join(serverDestDir, entry.name);
    console.log(`  copying: ${entry.name} [${entry.isSymbolicLink() ? "symlink" : entry.isDirectory() ? "dir" : "file"}]`);
    try {
      // On Windows use safeCpSync (JS-level recursion with cycle detection)
      // to avoid C-level stack overflows caused by deeply nested NTFS junctions
      // in the pnpm virtual store (e.g. apps/web/node_modules junction).
      if (platform() === "win32") {
        safeCpSync(src, dest);
      } else {
        cpSync(src, dest, { recursive: true, dereference: true });
      }
      console.log(`  done:    ${entry.name}`);
    } catch (err) {
      console.error(`  FAILED:  ${entry.name}: ${err.message}`);
      throw err;
    }
  }
  console.log("prepare-bundle: standalone copy done");

  // 1b. Fix pnpm symlinks in apps/web/node_modules (Linux/macOS only — on
  //     Windows cpSync dereferences NTFS junctions to real dirs, so no-op).
  const appWebModulesDir = join(serverDestDir, "apps", "web", "node_modules");
  if (existsSync(appWebModulesDir)) {
    for (const entry of readdirSync(appWebModulesDir, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue;
      const linkPath = join(appWebModulesDir, entry.name);
      const realTarget = realpathSync(linkPath);
      rmSync(linkPath, { recursive: true, force: true });
      cpSync(realTarget, linkPath, { recursive: true, dereference: true });
      console.log(`  resolved symlink: apps/web/node_modules/${entry.name}`);
    }
  }

  // 1c. Hoist pnpm virtual store → flat server/node_modules.
  const pnpmVirtualStore = join(serverDestDir, "node_modules", ".pnpm");
  const rootNodeModules = join(serverDestDir, "node_modules");
  if (existsSync(pnpmVirtualStore)) {
    console.log("prepare-bundle: hoisting pnpm virtual store...");
    for (const storeEntry of readdirSync(pnpmVirtualStore)) {
      const innerMods = join(pnpmVirtualStore, storeEntry, "node_modules");
      if (!existsSync(innerMods)) continue;
      for (const entry of readdirSync(innerMods, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const srcPath = join(innerMods, entry.name);
        if (entry.name.startsWith("@")) {
          const scopeDestDir = join(rootNodeModules, entry.name);
          if (!existsSync(scopeDestDir)) mkdirSync(scopeDestDir, { recursive: true });
          for (const scoped of readdirSync(srcPath, { withFileTypes: true })) {
            if (scoped.name.startsWith(".")) continue;
            const scopedDest = join(scopeDestDir, scoped.name);
            if (!existsSync(scopedDest)) {
              cpSync(join(srcPath, scoped.name), scopedDest, { recursive: true, dereference: true });
            }
          }
        } else {
          const destPath = join(rootNodeModules, entry.name);
          if (!existsSync(destPath)) {
            cpSync(srcPath, destPath, { recursive: true, dereference: true });
          }
        }
      }
    }
    console.log("  pnpm store hoisted → server/node_modules/");

    // Delete the virtual store now that packages are hoisted. NSIS bundles
    // everything under server/ recursively; the traced standalone output only
    // contains a production subset of each package, so files like Next.js
    // dev-overlay components are absent and NSIS aborts on the missing entry.
    // The flat hoisted packages are all the runtime needs — .pnpm is never
    // used by Node.js module resolution when every dependency is at the root.
    rmSync(pnpmVirtualStore, { recursive: true, force: true });
    console.log("  removed .pnpm virtual store (not needed after hoisting)");
  }

  // 2. Static assets
  console.log("prepare-bundle: copying static assets...");
  cpSync(
    join(appRoot, ".next", "static"),
    join(serverDestDir, "apps", "web", ".next", "static"),
    { recursive: true }
  );

  // 3. Public dir
  const publicDir = join(appRoot, "public");
  if (existsSync(publicDir)) {
    cpSync(publicDir, join(serverDestDir, "apps", "web", "public"), { recursive: true });
  }

  // 4. Copy better-sqlite3 (+ its runtime deps)
  console.log("prepare-bundle: copying native modules...");
  const pnpmStore = join(workspaceRoot, "node_modules", ".pnpm");
  const nativeModules = [
    {
      src: join(pnpmStore, "better-sqlite3@12.10.0", "node_modules", "better-sqlite3"),
      dest: join(serverDestDir, "node_modules", "better-sqlite3"),
    },
    {
      src: join(pnpmStore, "bindings@1.5.0", "node_modules", "bindings"),
      dest: join(serverDestDir, "node_modules", "bindings"),
    },
    {
      src: join(pnpmStore, "file-uri-to-path@1.0.0", "node_modules", "file-uri-to-path"),
      dest: join(serverDestDir, "node_modules", "file-uri-to-path"),
    },
  ];
  for (const { src, dest } of nativeModules) {
    if (existsSync(src)) {
      if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true, dereference: true });
    } else {
      console.warn(`WARN: native module not found at ${src}`);
    }
  }

  // 5. Remove sharp native libs on Linux (trip linuxdeploy)
  if (platform() !== "win32") {
    const pnpmVStore = join(serverDestDir, "node_modules", ".pnpm");
    if (existsSync(pnpmVStore)) {
      const sharpPrefixes = ["@img+sharp", "sharp@", "sharp-linux", "sharp-libvips"];
      for (const entry of readdirSync(pnpmVStore)) {
        if (sharpPrefixes.some((p) => entry.startsWith(p))) {
          rmSync(join(pnpmVStore, entry), { recursive: true, force: true });
        }
      }
    }
    function removeVipsLibs(dir) {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          removeVipsLibs(full);
        } else if (
          (entry.name.endsWith(".so") || entry.name.includes(".so.")) &&
          (full.includes("libvips") || full.includes("sharp"))
        ) {
          rmSync(full, { force: true });
        }
      }
    }
    removeVipsLibs(join(serverDestDir, "node_modules"));
  }

  // 6. Bundle the running Node.js binary as the Tauri sidecar
  console.log("prepare-bundle: copying node binary...");
  const binariesDir = join(tauriDir, "binaries");
  mkdirSync(binariesDir, { recursive: true });
  const targetTriple = getTauriTargetTriple();
  const ext = platform() === "win32" ? ".exe" : "";
  const nodeDest = join(binariesDir, `node-${targetTriple}${ext}`);
  copyFileSync(process.execPath, nodeDest);
  if (platform() !== "win32") chmodSync(nodeDest, 0o755);

  console.log("✓ Bundle prepared");
  console.log(`  server  → ${serverDestDir}`);
  console.log(`  node    → ${nodeDest}`);
} catch (err) {
  console.error("prepare-bundle FAILED:", err.message);
  console.error(err.stack);
  process.exit(1);
}
