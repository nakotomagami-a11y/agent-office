import { NextResponse } from "next/server";
import { db } from "@agent-office/domain/services";

const STATIC_KEYS = new Set([
  "theme",
  "active-project",
  "tabs-state",
  "claude-limits",
  "performance-mode",
  "office-grid",
  "office-decorations",
  "office-agents",
  "office-grass-color",
  "office-map-rev",
]);

const DYNAMIC_PREFIXES = [
  "office-grid:",
  "office-decorations:",
  "office-agents:",
  "office-grass-color:",
  "office-map-custom:",
  "office-map-rev:",
];

// The office grid alone (108×68 boolean array) serializes to ~40KB, so the old
// 10KB cap silently rejected every map save once a map grew — a real data-loss
// bug. 2MB is generous headroom while still bounding abuse.
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
  return NextResponse.json({ ok: true });
}
