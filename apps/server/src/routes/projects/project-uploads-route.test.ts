/**
 * An uploaded SVG is a document that can run script. Opened directly (a chat link, a new tab,
 * an `<iframe>`) it ran on the app's origin, which reaches every API route. Every upload is now
 * served with a CSP that blocks script, and `sandbox` gives it an opaque origin; an `<img>`
 * ignores both, so thumbnails still draw. Chosen over `Content-Disposition: attachment`, which
 * turns "open image" into a download and does nothing for an `<iframe>`.
 *
 *   pnpm --filter @agent-office/server test src/routes/projects/project-uploads-route.test.ts
 */
import assert from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { paths } from "@agent-office/domain/services";
import { GET as getProjectUpload } from "./[id]/uploads/[filename]/route";
import { GET as getAgentUpload } from "../agents/[id]/uploads/[filename]/route";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/summon",{method:"POST"})</script></svg>';

for (const [label, dir, get] of [
  ["project", paths.projectUploadsDir("p1"), getProjectUpload],
  ["agent", paths.agentUploadsDir("dev"), getAgentUpload],
] as const) {
  test(`${label} uploads: an SVG keeps its image type but cannot run script`, async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/evil.svg`, SVG);
    const res = await get(new Request("http://localhost/"), { params: Promise.resolve({ id: label === "project" ? "p1" : "dev", filename: "evil.svg" }) });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/svg+xml");
    const csp = res.headers.get("content-security-policy") ?? "";
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /\bsandbox\b/);
    assert.doesNotMatch(csp, /script-src/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });
}
