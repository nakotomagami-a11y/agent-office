// GET/PATCH /api/ui-settings — key/value UI state (layout, theme, active project).
// Internal keys prefixed `_` are hidden from GET.
import { NextResponse } from "next/server";
import { db, shellEnv } from "@agent-office/domain/services";
import { OFFICE_SETTING_KEYS } from "@agent-office/domain/config/office";

const STATIC_KEYS = new Set([
  "theme",
  "active-project",
  "tabs-state",
  "claude-limits",
  "performance-mode",
  // Auto-follow the power source (quality on AC, performance on battery).
  "performance-auto",
  ...Object.values(OFFICE_SETTING_KEYS),
  "office-map-rev",
  // First-run wizard draft — lets a partially-filled wizard survive an app restart.
  "agent-office:wizard-draft",
  // Sidebar/office view state — view mode + expanded/pinned roster groups
  // (use-office-store.ts's STORAGE_KEY).
  "office-view",
]);

const DYNAMIC_PREFIXES = [
  "office-grid:",
  "office-decorations:",
  "office-agents:",
  "office-grass-color:",
  "office-map-custom:",
  "office-map-rev:",
];

// The office grid alone (108×68 boolean array) serializes to ~40KB; 2MB is
// generous headroom while still bounding abuse.
const MAX_VALUE_BYTES = 2 * 1024 * 1024;

function isAllowedKey(key: string): boolean {
  if (STATIC_KEYS.has(key)) return true;
  return DYNAMIC_PREFIXES.some((p) => key.startsWith(p) && key.length > p.length);
}

export async function GET() {
  return NextResponse.json(db.getAllUiSettings());
}

export async function PATCH(request: Request) {
  let body: Record<string, string>;
  try { body = await request.json() as Record<string, string>; } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  for (const key of Object.keys(body)) {
    if (!isAllowedKey(key)) {
      return NextResponse.json({ error: "forbidden_key", key }, { status: 400 });
    }
  }
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== "string") continue;
    if (Buffer.byteLength(value, "utf8") > MAX_VALUE_BYTES) {
      return NextResponse.json({ error: "value_too_large", key, maxBytes: MAX_VALUE_BYTES }, { status: 400 });
    }
    db.setUiSetting(key, value);
  }
  // Tab switches (and any other tabs-state write) drive the terminal env
  // mirror — see shell-env.ts's header comment.
  if ("tabs-state" in body) {
    shellEnv.writeActiveShellEnv(shellEnv.activeProjectIdFromTabs());
  }
  return NextResponse.json({ ok: true });
}
