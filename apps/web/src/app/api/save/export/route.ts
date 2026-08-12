import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agents, db, projects } from "@agent-office/domain/services";
import { AGENTS_DIR } from "@agent-office/domain/services/paths";

export const dynamic = "force-dynamic";

type ProjectExport = ReturnType<typeof projects.readProject> & object;

function collectUniqueRosterAgents(project: ProjectExport) {
  const rosterAgents = project.meta.roster.map((inst) => {
    const id = inst.agentId;
    let content = "";
    try { content = readFileSync(join(AGENTS_DIR, `${id}.md`), "utf8"); } catch { /* missing */ }
    const memory = agents.readAgentMemory(id);
    return { id, content, memory };
  });
  const seen = new Set<string>();
  return rosterAgents.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

function collectOfficeSettings() {
  const allSettings = db.getAllUiSettings();
  return {
    grid: allSettings["office-grid"] ?? null,
    decorations: allSettings["office-decorations"] ?? null,
    agents: allSettings["office-agents"] ?? null,
    grassColor: allSettings["office-grass-color"] ?? null,
  };
}

type HistoryEntry = { agentId: string; instanceId: string; transcript: string };

function collectRosterHistory(project: ProjectExport): HistoryEntry[] {
  const history: HistoryEntry[] = [];
  for (const inst of project.meta.roster) {
    const row = db.getTranscript(inst.agentId, inst.instanceId);
    if (row?.items) {
      history.push({ agentId: inst.agentId, instanceId: inst.instanceId, transcript: row.items });
    }
  }
  return history;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const includeHistory = searchParams.get("history") === "1";

  if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

  const project = projects.readProject(projectId);
  if (!project) return Response.json({ error: "project_not_found" }, { status: 404 });

  try {
    const saveFile = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      project: { id: project.id, meta: project.meta, memory: project.memory },
      agents: collectUniqueRosterAgents(project),
      office: collectOfficeSettings(),
      ...(includeHistory ? { history: collectRosterHistory(project) } : {}),
    };

    const slug = project.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const filename = `${slug}-agent-office.json`;

    return new Response(JSON.stringify(saveFile, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return Response.json({ error: "export_failed", detail: String(e) }, { status: 500 });
  }
}
