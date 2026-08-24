// Portable project save-file bundle: export a project (+ its roster agents,
// office layout, and optionally transcripts) and restore it. Framework-agnostic
// - only touches domain services, so both /api/save routes stay thin controllers.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as agents from "../agents/agents";
import * as db from "../db";
import * as projects from "./projects";
import { AGENTS_DIR, isValidIdSegment } from "../infra/paths";
import { ensureDir, writeFileAtomic } from "../infra/fs-atomic";
import { OFFICE_SETTING_KEYS, type OfficeSettingField } from "../../config/office";
import type { Project } from "../../types";

const OFFICE_FIELDS = Object.keys(OFFICE_SETTING_KEYS) as OfficeSettingField[];

export interface SaveBundleAgent { id: string; content: string; memory: string }
export interface SaveHistoryEntry { agentId: string; instanceId: string; transcript: string }
export type OfficeSnapshot = Record<OfficeSettingField, string | null>;

// Export produces the project's real, typed meta; import receives whatever the
// validated save file carried (a loose record), so the two directions differ.
export interface SaveBundle {
  version: 1;
  exportedAt: string;
  project: { id: string; meta: Project["meta"]; memory: string };
  agents: SaveBundleAgent[];
  office: OfficeSnapshot;
  history?: SaveHistoryEntry[];
}

export interface ImportBundle {
  project: { id: string; meta: Record<string, unknown>; memory: string };
  agents: SaveBundleAgent[];
  office: OfficeSnapshot;
  history?: SaveHistoryEntry[];
}

function collectUniqueRosterAgents(project: Project): SaveBundleAgent[] {
  const seen = new Set<string>();
  const out: SaveBundleAgent[] = [];
  for (const inst of project.meta.roster) {
    const id = inst.agentId;
    if (seen.has(id)) continue;
    seen.add(id);
    let content = "";
    try { content = readFileSync(join(AGENTS_DIR, `${id}.md`), "utf8"); } catch { /* missing */ }
    out.push({ id, content, memory: agents.readAgentMemory(id) });
  }
  return out;
}

function collectOfficeSnapshot(): OfficeSnapshot {
  const all = db.getAllUiSettings();
  const out = {} as OfficeSnapshot;
  for (const field of OFFICE_FIELDS) out[field] = all[OFFICE_SETTING_KEYS[field]] ?? null;
  return out;
}

function collectRosterHistory(project: Project): SaveHistoryEntry[] {
  const history: SaveHistoryEntry[] = [];
  for (const inst of project.meta.roster) {
    const row = db.getTranscript(inst.agentId, inst.instanceId);
    if (row?.items) history.push({ agentId: inst.agentId, instanceId: inst.instanceId, transcript: row.items });
  }
  return history;
}

/** Build a portable bundle for a project, or null if the project doesn't exist. */
export function exportBundle(projectId: string, includeHistory: boolean): SaveBundle | null {
  const project = projects.readProject(projectId);
  if (!project) return null;
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    project: { id: project.id, meta: project.meta, memory: project.memory },
    agents: collectUniqueRosterAgents(project),
    office: collectOfficeSnapshot(),
    ...(includeHistory ? { history: collectRosterHistory(project) } : {}),
  };
}

function restoreAgents(list: SaveBundleAgent[]): void {
  ensureDir(AGENTS_DIR);
  for (const agent of list) {
    if (!agent.id || !isValidIdSegment(agent.id)) continue;
    if (agent.content) writeFileAtomic(join(AGENTS_DIR, `${agent.id}.md`), agent.content);
    agents.writeAgentMemory(agent.id, agent.memory);
  }
}

function restoreProject(p: ImportBundle["project"]): void {
  const meta = p.meta;
  if (projects.readProject(p.id)) {
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

function restoreOffice(office: OfficeSnapshot): void {
  for (const field of OFFICE_FIELDS) {
    const value = office[field];
    if (value != null) db.setUiSetting(OFFICE_SETTING_KEYS[field], value);
  }
}

function restoreHistory(history: SaveHistoryEntry[] | undefined): void {
  if (!history) return;
  for (const entry of history) {
    if (!isValidIdSegment(entry.agentId) || !isValidIdSegment(entry.instanceId)) continue;
    db.saveTranscript(entry.agentId, entry.instanceId, entry.transcript, null, null);
  }
}

/** Restore a validated bundle. Returns the number of agents written. */
export function importBundle(bundle: ImportBundle): { agentCount: number } {
  restoreAgents(bundle.agents);
  restoreProject(bundle.project);
  restoreOffice(bundle.office);
  restoreHistory(bundle.history);
  return { agentCount: bundle.agents.length };
}
