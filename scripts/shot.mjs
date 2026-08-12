// Headless screenshot helper (Playwright/Chromium) for verifying the running
// dev app. Usage:
//   node scripts/shot.mjs <url> <theme:light|dark> <out.png> [waitSelector]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3001/skills";
const theme = process.argv[3] ?? "dark";
const out = process.argv[4] ?? "/tmp/shot.png";
const waitSel = process.argv[5] ?? "canvas";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: "domcontentloaded" });
try {
  await page.waitForSelector(waitSel, { timeout: 15000 });
} catch { /* proceed even if selector never appears */ }
await page.waitForTimeout(1500); // let hydrate() fetch + apply the stored theme first
// Force the requested theme AFTER hydration so it isn't overwritten. WeaponIcon
// canvases are theme-independent; only the CSS card bg swaps, no redraw needed.
await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
await page.waitForTimeout(200);
const canvases = await page.locator("canvas").count();
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`shot ${out} (${theme}) canvases=${canvases}`);
