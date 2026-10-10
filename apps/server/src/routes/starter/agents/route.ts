// Starter-agent catalogue + importer.
//   GET  /api/starter/agents → bundled starter agents with frontmatter-derived
//      display info; the first-run wizard renders this list to pick which to import.
//   POST /api/starter/agents → body { agentIds: string[] } → copies the selected
//      .md files into ~/.claude/agents/, skipping any already present.
import { validateBody } from "../../../lib/validation";
import { starterAgentsImportSchema } from "@agent-office/api-contract";
import { listStarterAgents, importStarterAgents } from "../../../lib/starter-data";

export async function GET() {
  return Response.json(listStarterAgents());
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const { data, error } = validateBody(starterAgentsImportSchema, raw);
  if (error) return Response.json({ error: "agentIds_required" }, { status: 400 });

  const result = importStarterAgents(data.agentIds);
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 });
  return Response.json({ imported: result.imported, skipped: result.skipped });
}
