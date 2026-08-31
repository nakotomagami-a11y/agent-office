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

// ── Office floor layout ──────────────────────────────────────────────────
// The showcase seed creates projects + agents + runs, but a fresh project's
// office map is intentionally blank (all-water grid, 0 decorations, no agent
// placements — see office-scene-data.ts:makeSeedGrid). That's the correct
// default for a real new project, but it makes the flagship "office"
// screenshot a solid cyan void. So: generate a real island and drop the
// project's agents onto it before capturing, the same way a user would via
// Build > Terrain > Generate + dragging agents onto tiles.
//
// generateIsland() below is a deliberate, hand-kept-in-sync port of
// generateLand({shape:"island"}) from
// apps/web/src/modules/office/derive/land-generator.ts — duplicated rather
// than imported because this script runs standalone (no Next bundler, so no
// path aliases / TS) and the algorithm is small, pure, and stable.
const GRID_COLS = 108;
const GRID_ROWS = 68;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, t) => a + (b - a) * t;
function makeNoise(rng, freq) {
  const size = freq + 2;
  const vals = new Float32Array(size * size);
  for (let i = 0; i < vals.length; i++) vals[i] = rng();
  return (nx, ny) => {
    const fx = nx * freq, fy = ny * freq;
    const x0 = Math.min(size - 2, Math.floor(fx));
    const y0 = Math.min(size - 2, Math.floor(fy));
    const tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const v00 = vals[y0 * size + x0], v10 = vals[y0 * size + x0 + 1];
    const v01 = vals[(y0 + 1) * size + x0], v11 = vals[(y0 + 1) * size + x0 + 1];
    return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
  };
}
function generateIsland({ seed, coverage, roughness, cols, rows }) {
  const rng = mulberry32(seed || 1);
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
  const noise = makeNoise(rng, 4);
  const R = lerp(0.55, 1.02, coverage);
  const amp = roughness * 0.22;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const dx = ((x + 0.5) / cols - 0.5) * 2;
      const dy = ((y + 0.5) / rows - 0.5) * 2;
      const d = Math.hypot(dx, dy);
      const n = (noise((x + 0.5) / cols, (y + 0.5) / rows) - 0.5) * 2 * amp;
      if (d < R + n) grid[y][x] = true;
    }
  }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2) grid[y][x] = false;
  return grid;
}

const DECO_KINDS = ["tree", "tree2", "tree3", "bush", "bush2", "rock", "rock2"];

/** Lay out a generated island + a scatter of decorations + the project's
 *  roster placed on land tiles, so the office screenshot shows a real
 *  scene instead of the blank default. `roster` is [{agentId, instanceId}]. */
async function layoutOffice(projectId, roster) {
  const grid = generateIsland({ seed: 42, coverage: 0.62, roughness: 0.35, cols: GRID_COLS, rows: GRID_ROWS });
  const isLand = (x, y) => x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS && grid[y][x];
  const key = (x, y) => `${x},${y}`;
  const used = new Set();

  // BFS outward from (x,y) to the nearest unused land tile — used to snap
  // "nice" hand-picked spots (a spaced row, a ring) onto the actual
  // generated coastline instead of assuming every spot is land.
  function nearestFreeLand(x, y) {
    const seen = new Set([key(x, y)]);
    let frontier = [[x, y]];
    while (frontier.length > 0) {
      const next = [];
      for (const [fx, fy] of frontier) {
        const k = key(fx, fy);
        if (isLand(fx, fy) && !used.has(k)) return [fx, fy];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = fx + dx, ny = fy + dy, nk = key(nx, ny);
          if (!seen.has(nk) && nx >= 0 && nx < GRID_COLS && ny >= 0 && ny < GRID_ROWS) {
            seen.add(nk);
            next.push([nx, ny]);
          }
        }
      }
      frontier = next;
    }
    return [x, y]; // unreachable in practice — island always has room
  }

  const cx = Math.round(GRID_COLS / 2), cy = Math.round(GRID_ROWS / 2);

  // Roster in a spaced-out row through the island's center, like desks
  // along a shared bench, rather than a dense pile.
  const spacing = 5;
  const agents = {};
  roster.forEach(({ agentId, instanceId }, i) => {
    const wantX = cx + (i - (roster.length - 1) / 2) * spacing;
    const [x, y] = nearestFreeLand(Math.round(wantX), cy);
    used.add(key(x, y));
    agents[key(x, y)] = instanceId ? { agentId, instanceId } : { agentId };
  });

  // Decorations on a coarse ring around the roster row so they read as
  // scenery, not a pile — every `step` tiles on a expanding diamond outward
  // from center, skipping anything already occupied.
  const decorations = {};
  const decoCount = Math.min(24, Math.floor(roster.length * 3));
  const step = 6;
  let ring = 1;
  while (Object.keys(decorations).length < decoCount && ring < GRID_COLS) {
    for (const [dx, dy] of [[step * ring, 0], [-step * ring, 0], [0, step * ring], [0, -step * ring],
      [step * ring, step], [-step * ring, -step], [step, step * ring], [-step, -step * ring]]) {
      if (Object.keys(decorations).length >= decoCount) break;
      const [x, y] = nearestFreeLand(cx + dx, cy + dy);
      const k = key(x, y);
      if (used.has(k)) continue;
      used.add(k);
      decorations[k] = [{ kind: DECO_KINDS[Object.keys(decorations).length % DECO_KINDS.length] }];
    }
    ring++;
  }

  await fetch(`${BASE}/api/ui-settings`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      "office-grid": JSON.stringify(grid),
      "office-decorations": JSON.stringify(decorations),
      "office-grass-color": "green",
      [`office-agents:${projectId}`]: JSON.stringify(agents),
      "office-map-rev": "1",
    }),
  });
}

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

// Office screenshot is parked for now — being redone by hand — so skip the
// island layout seed too (its only consumer was that capture). Re-add
// ["/", "office"] to PAGES below and the layoutOffice() call above it to
// bring the automated capture back.

// ── Top-level pages ──────────────────────────────────────────────────────
const PAGES = [
  ["/projects", "projects"],
  [`/projects/${PROJECT_ID}`, "project"],
  ["/agents", "agents"],
  ["/activity?tab=insights", "activity"],
  ["/analytics", "analytics"],
  ["/memory", "memory"],
  ["/skills", "skills"],
  ["/schedules", "schedules"],
  ["/settings", "settings"],
  ["/docs", "docs"],
];
for (const [path, file] of PAGES) {
  await goto(path);
  if (file === "skills") await sleep(1_500); // registry mock resolves async
  // The isometric office (PixiJS + @pixi/tilemap) renders a flat placeholder
  // color for its first second or two while terrain/decoration/unit sprite
  // atlases load — worse on this page than anywhere else in the app because
  // it's normally the very first navigation, hitting a cold Next dev-server
  // compile on top of the texture loads. Give it real time to settle instead
  // of capturing the placeholder frame.
  if (file === "office") await sleep(3_000);
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
