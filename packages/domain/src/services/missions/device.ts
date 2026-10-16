// Which install this is, as mission posts name it (docs/missions.md). One id per machine user:
// every server on it shares the db, so they share the id.
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { getDb } from "../db/connection";

const KEY = "_device_id";

export function deviceSlug(host: string, suffix: string): string {
  const base = host.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "device";
  return `${base}-${suffix}`;
}

/** INSERT OR IGNORE then read back: two servers booting at once still agree on one id. */
export function deviceId(): string {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO ui_settings (key, value, updated_at) VALUES (?, ?, ?)")
    .run(KEY, deviceSlug(hostname(), randomBytes(3).toString("hex")), Date.now());
  const row = db.prepare("SELECT value FROM ui_settings WHERE key = ?").get(KEY) as { value: string };
  return row.value;
}

export const deviceLabel = (): string => hostname();
