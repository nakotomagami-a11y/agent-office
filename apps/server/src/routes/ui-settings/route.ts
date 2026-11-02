// GET/PATCH /api/ui-settings — key/value UI state (layout, theme, active project).
// Internal keys prefixed `_` are hidden from GET.
import { db, shellEnv } from "@agent-office/domain/services";

const ALLOWED_KEYS = new Set([
  "theme",
  "active-project",
  "tabs-state",
  "claude-limits",
  "performance-mode",
  // Auto-follow the power source (quality on AC, performance on battery).
  "performance-auto",
  // First-run wizard draft — lets a partially-filled wizard survive an app restart.
  "agent-office:wizard-draft",
  // Expanded/pinned roster groups (use-office-store.ts's STORAGE_KEY).
  "roster-groups",
]);

// Generous headroom for the largest value (tabs-state, claude-limits) while
// still bounding abuse.
const MAX_VALUE_BYTES = 2 * 1024 * 1024;

export async function GET() {
  return Response.json(db.getAllUiSettings());
}

export async function PATCH(request: Request) {
  let body: Record<string, string>;
  try { body = await request.json() as Record<string, string>; } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) {
      return Response.json({ error: "forbidden_key", key }, { status: 400 });
    }
  }
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== "string") continue;
    if (Buffer.byteLength(value, "utf8") > MAX_VALUE_BYTES) {
      return Response.json({ error: "value_too_large", key, maxBytes: MAX_VALUE_BYTES }, { status: 400 });
    }
    db.setUiSetting(key, value);
  }
  // Tab switches (and any other tabs-state write) drive the terminal env
  // mirror — see shell-env.ts's header comment.
  if ("tabs-state" in body) {
    shellEnv.writeActiveShellEnv(shellEnv.activeProjectIdFromTabs());
  }
  return Response.json({ ok: true });
}
