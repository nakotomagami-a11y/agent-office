// Builds the Tauri updater manifest (latest.json) from the signed artifacts
// already attached to a GitHub Release, then uploads it back to that release.
//
// Runs in CI after the per-platform build workflows have uploaded their
// `.sig` files. It reads whatever signed artifacts exist on the release and
// assembles a single `platforms` map, so it's safe to run more than once —
// the last run (once every platform has uploaded) produces the complete file.
//
// Env: GH_TOKEN, GH_REPO (owner/repo), RELEASE_TAG (e.g. v0.1.1).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tag = process.env.RELEASE_TAG || process.argv[2];
const repo = process.env.GH_REPO;
if (!tag || !repo) {
  console.error("gen-latest-json: RELEASE_TAG and GH_REPO are required");
  process.exit(1);
}
const version = tag.replace(/^v/, "");
const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });

// Map a `.sig` artifact filename → [tauri platform key, the artifact it signs].
function platformFor(name) {
  // This Tauri version signs the AppImage directly — no .tar.gz wrapping,
  // despite what older Tauri docs describe.
  if (name.endsWith(".AppImage.sig")) return ["linux-x86_64", name.slice(0, -4)];
  if (name.endsWith("-setup.exe.sig")) return ["windows-x86_64", name.slice(0, -4)];
  if (name.endsWith(".app.tar.gz.sig")) return ["darwin-aarch64", name.slice(0, -4)];
  return null;
}

const release = JSON.parse(gh(["release", "view", tag, "--repo", repo, "--json", "assets,body"]));
const assets = release.assets ?? [];
const byName = new Map(assets.map((a) => [a.name, a]));

const platforms = {};
for (const asset of assets) {
  const mapped = platformFor(asset.name);
  if (!mapped) continue;
  const [key, targetName] = mapped;
  if (!byName.has(targetName)) {
    console.warn(`skip ${asset.name}: signed artifact ${targetName} not on release`);
    continue;
  }
  gh(["release", "download", tag, "--repo", repo, "--pattern", asset.name, "--dir", tmpdir(), "--clobber"]);
  const signature = readFileSync(join(tmpdir(), asset.name), "utf8").trim();
  platforms[key] = {
    signature,
    url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(targetName)}`,
  };
}

if (Object.keys(platforms).length === 0) {
  console.error("gen-latest-json: no signed artifacts found yet — nothing to publish");
  process.exit(0);
}

const manifest = {
  version,
  notes: (release.body ?? "").trim() || `Agent Office ${version}`,
  pub_date: new Date().toISOString(),
  platforms,
};

const out = join(tmpdir(), "latest.json");
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
gh(["release", "upload", tag, out, "--repo", repo, "--clobber"]);
console.log(`Uploaded latest.json for ${tag} with platforms: ${Object.keys(platforms).join(", ")}`);
