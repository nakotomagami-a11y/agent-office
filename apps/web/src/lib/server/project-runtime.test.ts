import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { detectPackageManager, resolvePackageDirs } from "./project-runtime";

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "ao-proj-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const pkg = (dir: string) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "package.json"), "{}"); };
const lock = (dir: string, name: string) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, name), ""); };

describe("resolvePackageDirs", () => {
  it("returns the root when it has a package.json (workspace monorepo)", () => {
    pkg(root);
    pkg(join(root, "frontend"));
    expect(resolvePackageDirs(root)).toEqual([root]);
  });

  it("targets subfolders when the root has no package.json (the tuningteam bug)", () => {
    // root has only a stub lockfile, no package.json — the exact failing case
    writeFileSync(join(root, "package-lock.json"), "{}");
    pkg(join(root, "frontend"));
    pkg(join(root, "backend"));
    const dirs = resolvePackageDirs(root).map((d) => basename(d));
    expect(dirs).toEqual(["frontend", "backend"]);
  });

  it("returns nothing when no package.json exists anywhere it looks", () => {
    writeFileSync(join(root, "package-lock.json"), "{}");
    expect(resolvePackageDirs(root)).toEqual([]);
  });
});

describe("detectPackageManager", () => {
  it("prefers pnpm > yarn > bun > npm", () => {
    lock(root, "yarn.lock");
    lock(root, "package-lock.json");
    expect(detectPackageManager(root)).toBe("yarn"); // yarn beats npm fallback

    lock(root, "pnpm-lock.yaml");
    expect(detectPackageManager(root)).toBe("pnpm"); // pnpm wins
  });

  it("falls back to npm with no lockfile", () => {
    expect(detectPackageManager(root)).toBe("npm");
  });
});
