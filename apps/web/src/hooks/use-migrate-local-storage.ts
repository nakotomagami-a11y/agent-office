"use client";

import { useEffect } from "react";
import { patchUiSettings, putTranscript, putDraft } from "@/lib/api/migration";

const LEGACY_KEYS = {
  transcripts: "agent-office:chat-transcripts:v1",
  drafts: "agent-office:chat-drafts:v1",
  theme: "agent-office:theme",
  activeProject: "agent-office:active-project",
  claudeLimits: "agent-office:claude-limits",
  officeGrid: "agent-office:office-grid:v2",
  officeDecorations: "agent-office:office-decorations:v2",
  officeAgents: "agent-office:office-agents:v2",
  officeGrassColor: "agent-office:office-grass-color:v1",
};

const MIGRATION_FLAG = "agent-office:ls-migrated-to-sqlite";

async function runMigration(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(MIGRATION_FLAG)) return;

  const hasAny = Object.values(LEGACY_KEYS).some((k) => window.localStorage.getItem(k) !== null);
  if (!hasAny) {
    window.localStorage.setItem(MIGRATION_FLAG, "1");
    return;
  }

  try {
    // Migrate UI settings (theme, active-project, claude-limits, office scene)
    const uiPatch: Record<string, string> = {};
    const theme = window.localStorage.getItem(LEGACY_KEYS.theme);
    if (theme === "dark" || theme === "light") uiPatch["theme"] = theme;
    const ap = window.localStorage.getItem(LEGACY_KEYS.activeProject);
    if (ap) uiPatch["active-project"] = ap;
    const cl = window.localStorage.getItem(LEGACY_KEYS.claudeLimits);
    if (cl) uiPatch["claude-limits"] = cl;
    const grid = window.localStorage.getItem(LEGACY_KEYS.officeGrid);
    if (grid) uiPatch["office-grid"] = grid;
    const deco = window.localStorage.getItem(LEGACY_KEYS.officeDecorations);
    if (deco) uiPatch["office-decorations"] = deco;
    const agents = window.localStorage.getItem(LEGACY_KEYS.officeAgents);
    if (agents) uiPatch["office-agents"] = agents;
    const gc = window.localStorage.getItem(LEGACY_KEYS.officeGrassColor);
    if (gc) uiPatch["office-grass-color"] = gc;

    if (Object.keys(uiPatch).length > 0) {
      await patchUiSettings(uiPatch);
    }

    // Migrate transcripts
    const transcriptsRaw = window.localStorage.getItem(LEGACY_KEYS.transcripts);
    if (transcriptsRaw) {
      try {
        const all = JSON.parse(transcriptsRaw) as Record<string, { items?: unknown[]; activeRunId?: string | null; sessionId?: string | null }>;
        for (const [key, t] of Object.entries(all)) {
          const idx = key.indexOf("::");
          const agentId = idx === -1 ? key : key.slice(0, idx);
          const instanceId = idx === -1 ? "default" : key.slice(idx + 2) || "default";
          await putTranscript(agentId, instanceId, {
            items: JSON.stringify(t.items ?? []),
            activeRunId: t.activeRunId ?? null,
            sessionId: t.sessionId ?? null,
          });
        }
      } catch { /* skip bad transcript data */ }
    }

    // Migrate drafts
    const draftsRaw = window.localStorage.getItem(LEGACY_KEYS.drafts);
    if (draftsRaw) {
      try {
        const all = JSON.parse(draftsRaw) as Record<string, string>;
        for (const [key, text] of Object.entries(all)) {
          if (!text) continue;
          const idx = key.indexOf("::");
          const agentId = idx === -1 ? key : key.slice(0, idx);
          const instanceId = idx === -1 ? "default" : key.slice(idx + 2) || "default";
          await putDraft(agentId, instanceId, text);
        }
      } catch { /* skip */ }
    }

    // Clear all legacy keys
    for (const key of Object.values(LEGACY_KEYS)) {
      window.localStorage.removeItem(key);
    }
    window.localStorage.setItem(MIGRATION_FLAG, "1");
  } catch {
    // Migration failed - will retry next load (migration flag not set)
  }
}

export function useMigrateLocalStorage() {
  useEffect(() => {
    void runMigration();
  }, []);
}
