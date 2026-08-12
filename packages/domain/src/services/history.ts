import { homedir } from "node:os";
import { DB_PATH } from "./paths";
import * as db from "./db";
import type { ContextProfile } from "../types/index";

export type { HistoryMessage } from "./db";
export type { ContextProfile } from "../types/index";

export const PROFILE_TOK: Record<ContextProfile, number> = {
  tight: 400,
  balanced: 1_500,
  deep: 4_000,
};

const MSG_LIMIT: Record<ContextProfile, number> = { tight: 3, balanced: 8, deep: 16 };
const TRUNCATE: Record<ContextProfile, number> = { tight: 800, balanced: 500, deep: 300 };

export function appendRun(opts: {
  key: string;
  userContent: string;
  assistantContent: string;
  runId: string;
  ts: number;
}): void {
  const [agentId, ...rest] = opts.key.split("::");
  const instanceId = rest.join("::") || "default";
  db.insertMessages({
    runId: opts.runId,
    agentId: agentId ?? opts.key,
    instanceId,
    userContent: opts.userContent,
    assistantContent: opts.assistantContent,
    ts: opts.ts,
  });
}

function buildFtsQuery(prompt: string): string | null {
  const stopwords = new Set([
    "this","that","with","from","have","will","your","what","when","then",
    "they","them","their","there","these","those","been","were","being",
    "would","could","should","about","which","while","where","into",
    "through","during","before","after","above","below","between","each",
    "other","more","also","than","only","some","such","both","very","just",
    "even","over","most","same","much","need","make","want","like","know",
  ]);
  const words = [
    ...new Set(
      (prompt.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []).filter(
        (w) => !stopwords.has(w),
      ),
    ),
  ].slice(0, 10);
  return words.length === 0 ? null : words.join(" OR ");
}

function relevanceScore(promptWords: Set<string>, content: string): number {
  if (promptWords.size === 0) return 1;
  const words = content.toLowerCase().match(/\b\w{4,}\b/g) ?? [];
  const hits = words.filter((w) => promptWords.has(w)).length;
  return hits / Math.max(words.length, 1);
}

export function getContextMessages(opts: {
  agentId: string;
  instanceId: string;
  projectId?: string;
  profile: ContextProfile;
  currentPrompt: string;
}): db.HistoryMessage[] {
  const { agentId, instanceId, projectId, profile, currentPrompt } = opts;
  const limit = MSG_LIMIT[profile];

  const recent = projectId
    ? db.getRecentMessagesByProject(agentId, projectId, limit)
    : db.getRecentMessages(agentId, instanceId, limit);

  if (profile === "balanced") {
    const promptWords = new Set(
      (currentPrompt.toLowerCase().match(/\b\w{4,}\b/g) ?? []),
    );
    return recent.filter((m, i) => {
      if (i >= recent.length - 2) return true;
      return relevanceScore(promptWords, m.content) >= 0.015;
    });
  }

  if (profile === "deep") {
    const ftsQuery = buildFtsQuery(currentPrompt);
    const ftsResults = ftsQuery
      ? db.searchMessagesForAgent(agentId, instanceId, ftsQuery, 10)
      : [];
    const seen = new Set<string>();
    const merged: db.HistoryMessage[] = [];
    for (const m of [...recent, ...ftsResults]) {
      const key = `${m.runId}:${m.ts}`;
      if (!seen.has(key)) { seen.add(key); merged.push(m); }
    }
    merged.sort((a, b) => a.ts - b.ts);
    return merged;
  }

  return recent;
}

export function formatPriorContext(
  messages: db.HistoryMessage[],
  profile: ContextProfile = "balanced",
): string {
  if (messages.length === 0) return "";
  const truncate = TRUNCATE[profile];
  const body = messages
    .map((m) => {
      const label = m.role === "user" ? "User" : "Assistant";
      let content = m.content;
      if (profile === "deep" && m.role === "assistant") {
        const paras = content.split(/\n\n+/);
        const last = paras[paras.length - 1] ?? content;
        content = last.length > truncate ? last.slice(-truncate) + "… [trimmed]" : last;
      } else {
        content = content.length > truncate
          ? content.slice(0, truncate) + "… [truncated]"
          : content;
      }
      return `${label}: ${content}`;
    })
    .join("\n\n");
  return `[Prior conversation - ${messages.length} most recent messages]\n${body}\n[End prior context]\n\n`;
}

export function historyNote(agentId: string, instanceId: string): string {
  const dbPath = DB_PATH.replace(homedir(), "~");
  const safeAgentId = agentId.replace(/'/g, "''");
  const safeInstanceId = instanceId.replace(/'/g, "''");
  return `${dbPath} - query: sqlite3 "${dbPath}" "SELECT role, content FROM messages WHERE agent_id='${safeAgentId}' AND instance_id='${safeInstanceId}' ORDER BY ts DESC LIMIT 20"`;
}
