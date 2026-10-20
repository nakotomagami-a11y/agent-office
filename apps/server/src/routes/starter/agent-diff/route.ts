// Agent migration diff + apply.
//   GET  /api/starter/agent-diff → bundled MANIFEST.json vs installed ~/.claude/agents/*.md:
//      newAgents, changed (bundle copy changed), editedLocally (only the local copy changed),
//      onlyLocal (never touched), versions, previously-skipped slugs.
//   POST /api/starter/agent-diff → body { accept, skip, markComplete } → backs up
//      then overwrites each accepted agent, records skips per-version, bumps version.
//      A bundle older than the installed roster is a 409 `bundle_older`: nothing is written.
import { computeAgentDiff, applyAgentMigration } from "../../../lib/starter-data";

export async function GET() {
  const outcome = computeAgentDiff();
  if (!outcome.ok) return Response.json({ error: outcome.error }, { status: 500 });
  return Response.json(outcome.diff);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const { accept, skip, markComplete } = body as { accept?: unknown; skip?: unknown; markComplete?: boolean };

  const outcome = applyAgentMigration(accept, skip, markComplete);
  if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status });
  return Response.json(outcome.result);
}
