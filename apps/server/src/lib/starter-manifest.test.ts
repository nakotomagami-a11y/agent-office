import assert from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { z } from "zod";

// MANIFEST.json tells the app which bundled agents changed since a user installed them; a stale hash
// shows every user a wrong "changed" list. Fix with apps/web/starter-data/agents/regenerate-manifest.mjs.
const DIR = new URL("../../../web/starter-data/agents/", import.meta.url);
const Manifest = z.object({ agents: z.array(z.object({ file: z.string(), hash: z.string() })) });

test("every bundled agent is in the manifest, with its file's hash", () => {
  const manifest = Manifest.parse(JSON.parse(readFileSync(new URL("MANIFEST.json", DIR), "utf8")));
  const listed = manifest.agents.map((a) => a.file).sort();
  const onDisk = readdirSync(DIR).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md").sort();
  assert.deepStrictEqual(listed, onDisk);
  const stale = manifest.agents.filter((a) => {
    const lf = readFileSync(new URL(a.file, DIR), "utf8").replace(/\r\n/g, "\n");
    return createHash("sha256").update(lf).digest("hex").slice(0, 16) !== a.hash;
  });
  assert.deepStrictEqual(stale.map((a) => a.file), [], "run regenerate-manifest.mjs");
});
