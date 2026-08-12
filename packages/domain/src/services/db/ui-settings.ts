import { getDb } from "./connection";

export function getUiSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM ui_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setUiSetting(key: string, value: string): void {
  getDb().prepare(`
    INSERT INTO ui_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `).run(key, value, Date.now());
}

export function getAllUiSettings(): Record<string, string> {
  const rows = getDb().prepare("SELECT key, value FROM ui_settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'").all() as Array<{ key: string; value: string }>;
  const out: Record<string, string> = {};
  for (const { key, value } of rows) out[key] = value;
  return out;
}
