import { join } from "node:path";
import { NextResponse } from "next/server";
import { agents, db, projects } from "@agent-office/domain/services";
import { AGENTS_DIR, isValidIdSegment } from "@agent-office/domain/services/paths";
import { ensureDir, writeFileAtomic } from "@agent-office/domain/services/fs-atomic";
import { readBoundedText } from "@/lib/api-helpers";

const IMPORT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

interface SaveFile {
  version: 1;
  exportedAt: string;
  project: { id: string; meta: Record<string, unknown>; memory: string };
  agents: Array<{ id: string; content: string; memory: string }>;
  office: { grid: string | null; decorations: string | null; agents: string | null; grassColor: string | null };
  history?: Array<{ agentId: string; instanceId: string; transcript: string }>;
}

function isSaveFile(data: unknown): data is SaveFile {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    d.version === 1 &&
    typeof d.exportedAt === "string" &&
    d.project !== null && typeof d.project === "object" &&
    Array.isArray(d.agents) &&
    d.office !== null && typeof d.office === "object"
  );
}

function restoreAgents(list: SaveFile["agents"]): void {
  ensureDir(AGENTS_DIR);
  for (const agent of list) {
    if (typeof agent.id !== "string" || !agent.id) continue;
    if (!isValidIdSegment(agent.id)) continue;
    if (typeof agent.content === "string" && agent.content) {
      writeFileAtomic(join(AGENTS_DIR, `${agent.id}.md`), agent.content);
    }
    if (typeof agent.memory === "string") {
      agents.writeAgentMemory(agent.id, agent.memory);
    }
  }
}

function restoreProject(p: SaveFile["project"]): void {
  const meta = p.meta as Record<string, unknown>;
  const existing = projects.readProject(p.id);
  if (existing) {
    projects.updateProject(p.id, { meta, memory: p.memory });
    return;
  }
  projects.createProject({
    id: p.id,
    name: typeof meta.name === "string" ? meta.name : p.id,
    description: typeof meta.description === "string" ? meta.description : "",
  });
  projects.updateProject(p.id, { meta, memory: p.memory });
}

function restoreOfficeSettings(office: SaveFile["office"]): void {
  const officeKeyMap: Array<[string, string | null]> = [
    ["office-grid", office.grid],
    ["office-decorations", office.decorations],
    ["office-agents", office.agents],
    ["office-grass-color", office.grassColor],
  ];
  for (const [key, value] of officeKeyMap) {
    if (value !== null && value !== undefined) db.setUiSetting(key, value);
  }
}

function isValidHistoryEntry(entry: unknown): entry is { agentId: string; instanceId: string; transcript: string } {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  if (typeof e.agentId !== "string" || typeof e.instanceId !== "string" || typeof e.transcript !== "string") return false;
  return isValidIdSegment(e.agentId) && isValidIdSegment(e.instanceId);
}

function restoreHistory(history: SaveFile["history"]): void {
  if (!Array.isArray(history)) return;
  for (const entry of history) {
    if (!isValidHistoryEntry(entry)) continue;
    db.saveTranscript(entry.agentId, entry.instanceId, entry.transcript, null, null);
  }
}

export async function POST(request: Request) {
  const { text, error: bodyErr } = await readBoundedText(request, IMPORT_MAX_BYTES);
  if (bodyErr) return bodyErr;

  let raw: unknown;
  try { raw = JSON.parse(text); } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isSaveFile(raw)) {
    return NextResponse.json({ error: "invalid_save_file", detail: "Expected version:1 project save file" }, { status: 400 });
  }

  const data = raw;
  if (!isValidIdSegment(data.project.id)) {
    return NextResponse.json({ error: "invalid_save_file", detail: "Invalid project id" }, { status: 400 });
  }

  try {
    restoreAgents(data.agents);
    restoreProject(data.project);
    restoreOfficeSettings(data.office);
    restoreHistory(data.history);
    return NextResponse.json({ ok: true, agentCount: data.agents.length });
  } catch (e) {
    return NextResponse.json({ error: "import_failed", detail: String(e) }, { status: 500 });
  }
}
