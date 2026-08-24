// Dev-only seed/reset surface. Seeds the showcase demo world (projects, chats,
// activity, accounts, secrets, schedules) and offers generic db maintenance.
// Prod builds return 404 (never ships).
import { NextResponse } from "next/server";
import { statSync, readdirSync } from "node:fs";
import { match } from "ts-pattern";
import { db, paths } from "@agent-office/domain/services";
import { forbidInProd } from "@/lib/api-helpers";
import { seedShowcase, clearShowcase } from "./showcase";

export async function POST(request: Request) {
  const gate = forbidInProd();
  if (gate) return gate;
  const body = await request.json() as { action?: string };

  return match(body.action)
    .with("showcase", () => {
      seedShowcase();
      return NextResponse.json({ ok: true, message: "Showcase world seeded (3 projects, chats, activity, accounts, secrets, schedules)." });
    })
    .with("clear-showcase", () => {
      clearShowcase();
      return NextResponse.json({ ok: true, message: "Showcase data cleared." });
    })
    .with("clear-all-runs", () => {
      const rawDb = db.getDb();
      rawDb.prepare("DELETE FROM tool_calls").run();
      rawDb.prepare("DELETE FROM messages").run();
      rawDb.prepare("DELETE FROM runs").run();
      return NextResponse.json({ ok: true, message: "All runs, messages, and tool calls deleted." });
    })
    .with("fix-orphans", () => {
      const rawDb = db.getDb();
      const result = rawDb.prepare("UPDATE runs SET status='error', exit_code=-1 WHERE status='running'").run();
      return NextResponse.json({ ok: true, message: `${result.changes} orphaned run(s) marked as error.` });
    })
    .otherwise(() => NextResponse.json({ error: "unknown action" }, { status: 400 }));
}

export function GET() {
  const gate = forbidInProd();
  if (gate) return gate;
  const rawDb = db.getDb();
  const runsCount = (rawDb.prepare("SELECT COUNT(*) as n FROM runs").get() as { n: number }).n;
  const messagesCount = (rawDb.prepare("SELECT COUNT(*) as n FROM messages").get() as { n: number }).n;
  const orphansCount = (rawDb.prepare("SELECT COUNT(*) as n FROM runs WHERE status='running'").get() as { n: number }).n;

  let dbSizeBytes = 0;
  try { dbSizeBytes = statSync(paths.DB_PATH).size; } catch { /* ignore */ }

  let agentsCount = 0;
  try { agentsCount = readdirSync(paths.AGENTS_DIR).filter(f => f.endsWith(".md") && !f.startsWith("_")).length; } catch { /* ignore */ }

  return NextResponse.json({
    runsCount,
    messagesCount,
    orphansCount,
    dbSizeBytes,
    agentsCount,
    dbPath: paths.DB_PATH,
  });
}
