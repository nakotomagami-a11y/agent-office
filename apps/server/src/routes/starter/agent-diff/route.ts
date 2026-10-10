// Agent migration diff + apply.
//   GET  /api/starter/agent-diff → diff between the bundled agents MANIFEST.json and
//      installed ~/.claude/agents/*.md: newAgents (bundled, not installed), changed
//      (both but hash differs), onlyLocal (installed, not bundled — never touched),
//      plus bundleVersion + installedVersion + previously-skipped slugs.
//   POST /api/starter/agent-diff → body { accept, skip, markComplete } → backs up
//      then overwrites each accepted agent, records skips per-version, bumps version.
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
  if (!outcome.ok) return Response.json({ error: outcome.error }, { status: 500 });
  return Response.json(outcome.result);
}
