import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { AGENTS_DIR } from "@agent-office/domain/services/paths";
import { validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export type HistoryEntry = {
  filename: string;
  ts: number;
  sizeBytes: number;
};

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  if (!existsSync(AGENTS_DIR)) {
    return NextResponse.json([] as HistoryEntry[]);
  }

  const prefix = `${id}.body.`;
  const files = readdirSync(AGENTS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".md"))
    .sort()
    .reverse(); // newest first

  const entries: HistoryEntry[] = files.map((filename) => {
    const filePath = join(AGENTS_DIR, filename);
    const stats = statSync(filePath);
    // Extract ISO timestamp from filename: <id>.body.<ISO-with-dashes>.md
    // The timestamp portion replaces : and . with - so we reverse that
    const inner = filename.slice(prefix.length, -".md".length);
    // inner looks like 2024-01-15T10-30-45-123Z - convert back to parseable ISO
    const isoRaw = inner
      .replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z")
      .replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, "T$1:$2:$3Z");
    const ts = Date.parse(isoRaw) || stats.mtimeMs;
    return { filename, ts, sizeBytes: stats.size };
  });

  return NextResponse.json(entries);
}
