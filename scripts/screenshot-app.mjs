// Screenshot workflow — captures every top-level page (and a few representative
// chat states) against a fake, leak-free "showcase" dataset. Produces the
// images used in README.md / marketing material.
//
// Usage (from repo root, after `bash scripts/screenshot-app.sh` has booted the
// isolated showcase server + seeded data — see that file for the full flow):
//   node scripts/screenshot-app.mjs [outDir]
//
// Env overrides:
//   SHOT_BASE  - base URL of the running app (default http://localhost:3009)
//   SHOT_THEME - "dark" | "light" (default dark)
//
// Design notes:
// - Navigates by URL wherever possible (`page.goto`) rather than clicking
//   through nav chrome — the account-chip dropdown, sidebar, etc. are UI
//   surface that changes; routes are the stable contract (packages/domain's
//   PAGE_ROUTES).
// - Chat panels are NOT deep-linkable by URL (the `?modal=agent&...` query
//   Next writes on open isn't restored on a fresh load), so those are reached
//   by clicking a matching row in the project hero's "Recent runs" table.
// - `/skills` and the "Servers" (processes) modal both hit live network/OS
//   surfaces that don't have deterministic showcase content, so their API
//   routes are mocked with static fixtures for the duration of the capture.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3009";
const THEME = process.env.SHOT_THEME ?? "dark";
const OUT = resolve(process.argv[2] ?? "screenshots");
const PROJECT_ID = "nebula-commerce";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hide dev-only chrome that would otherwise show up in every shot.
const HIDE_CSS = [
  "nextjs-portal",
  "#__next-build-watcher",
  "[data-next-badge-root]",
  "[data-nextjs-toast]",
  '[class^="tsqd-"]',
  '[class*=" tsqd-"]',
  ".tsqd-parent-container",
].join(",") + "{display:none !important;visibility:hidden !important;}";

const SKILLS_MOCK = (() => {
  const SRC = "anthropics/skills";
  const mk = (name, description, tags, installed) => ({
    source: SRC, ref: "main", name, description, path: `skills/${name}`,
    sha: Math.random().toString(16).slice(2, 9), tags, installed,
  });
  return [
    mk("code-review", "Structured multi-language code review with severity-ranked findings.", ["engineering", "quality"], true),
    mk("pdf-processing", "Extract text, tables, and forms from PDFs; fill and generate documents.", ["documents"], true),
    mk("test-generator", "Generate unit, integration, and e2e tests with coverage analysis.", ["testing", "quality"], true),
    mk("api-design-reviewer", "REST/GraphQL API design review with breaking-change detection.", ["backend"], false),
    mk("stripe-integration", "Production Stripe: subscriptions, webhooks, usage billing.", ["payments", "backend"], true),
    mk("react-performance", "Diagnose and fix React re-render, bundle, and hydration issues.", ["frontend"], false),
    mk("security-audit", "OWASP Top 10, secret scanning, dependency CVE triage.", ["security"], true),
  ];
})();

const PROCESSES_MOCK = (() => {
  const now = Date.now();
  const CWD = "~/code/nebula-commerce";
  const row = (pid, port, name, cmd, ago, memMb) => ({
    pid, port, address: "127.0.0.1", name, cmd, cwd: CWD,
    startedAt: now - ago, memMb, projectId: PROJECT_ID, projectName: "Nebula Commerce",
  });
  return [
    row(4211, 3000, "next dev", "next dev --turbopack", 2 * 3_600_000, 412),
    row(4288, 5432, "postgres", "postgres -D data --port 5432", 3 * 3_600_000, 186),
    row(4355, 4242, "stripe listen", "stripe listen --forward-to localhost:3000/api/webhooks/stripe", 3_600_000, 38),
  ];
})();

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1512, height: 945 }, deviceScaleFactor: 2 });
await ctx.addInitScript((css) => {
  const apply = () => {
    const s = document.createElement("style");
    s.id = "shot-hide";
    s.textContent = css;
    document.head?.appendChild(s);
  };
  if (document.head) apply();
  else document.addEventListener("DOMContentLoaded", apply);
}, HIDE_CSS);
const page = await ctx.newPage();

await page.route("**/api/skills/registry**", (route) =>
  route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SKILLS_MOCK) })
    : route.continue(),
);
await page.route("**/api/processes**", (route) =>
  route.request().method() === "GET"
    ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PROCESSES_MOCK) })
    : route.continue(),
);

async function dismissOverlays() {
  // "Apply choices" fully dismisses the agent-roster-migration modal so it
  // doesn't reappear on every subsequent navigation. Everything else is a
  // one-shot "remind me later"-style dismiss.
  for (const label of ["Apply choices", "Remind me later", "Not now", "Skip"]) {
    try {
      const btn = page.getByRole("button", { name: label }).first();
      if (await btn.isVisible({ timeout: 300 })) {
        await btn.click();
        await sleep(250);
      }
    } catch { /* not present */ }
  }
}

async function forceTheme() {
  await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), THEME);
}

async function shot(name) {
  await forceTheme();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("✓", name);
}

async function goto(path) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await sleep(1_200);
  await dismissOverlays();
  await sleep(400);
}

// ── Top-level pages ──────────────────────────────────────────────────────
const PAGES = [
  ["/projects", "projects"],
  [`/projects/${PROJECT_ID}`, "project"],
  ["/agents", "agents"],
  ["/analytics", "analytics"],
  ["/memory", "memory"],
  ["/skills", "skills"],
  ["/schedules", "schedules"],
];
for (const [path, file] of PAGES) {
  await goto(path);
  if (file === "skills") await sleep(1_500); // registry mock resolves async
  await shot(file);
}

// ── Servers (processes modal) — opened from the account-chip nav menu ────
await goto(`/projects/${PROJECT_ID}`);
try {
  await page.getByRole("button", { name: "Local single-user" }).first().click();
  await sleep(300);
  await page.getByText("Servers", { exact: true }).first().click();
  await sleep(1_000);
  await shot("processes");
} catch (e) {
  console.log("✗ processes (nav failed):", String(e).slice(0, 120));
}
try { await page.keyboard.press("Escape"); } catch { /* noop */ }

// ── Chat states — click a matching "Recent runs" row on the project hero ─
const CHATS = [
  ["done developer", "chat-developer"],
  ["working orchestrator", "chat-orchestrator"],
  ["done frontend-craftsman", "chat-frontend"],
  ["working backend-builder", "chat-backend"],
];
for (const [rowNamePrefix, file] of CHATS) {
  await goto(`/projects/${PROJECT_ID}`);
  try {
    const row = page.getByRole("button", { name: new RegExp(rowNamePrefix, "i") }).first();
    await row.waitFor({ state: "visible", timeout: 20_000 });
    await row.scrollIntoViewIfNeeded();
    await row.click({ timeout: 10_000 });
    await sleep(1_200);
    await dismissOverlays();
    await sleep(400);
    await shot(file);
  } catch (e) {
    console.log(`✗ ${file} (row not found):`, String(e).slice(0, 120));
  }
  try { await page.keyboard.press("Escape"); } catch { /* noop */ }
}

await browser.close();
console.log(`DONE — ${OUT}`);
