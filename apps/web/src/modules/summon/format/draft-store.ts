// Persists per-conversation composer draft text via /api/drafts.

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";

function parseKey(key: string): { agentId: string; instanceId: string } {
  const idx = key.indexOf("::");
  if (idx === -1) return { agentId: key, instanceId: "default" };
  return { agentId: key.slice(0, idx), instanceId: key.slice(idx + 2) || "default" };
}

export async function loadDraft(key: string): Promise<string> {
  const { agentId, instanceId } = parseKey(key);
  try {
    const res = await apiClient.get<{ text: string }>(API_ROUTES.drafts, { params: { agentId, instanceId } });
    return typeof res.data.text === "string" ? res.data.text : "";
  } catch {
    return "";
  }
}

export async function saveDraft(key: string, text: string): Promise<void> {
  const { agentId, instanceId } = parseKey(key);
  try {
    await apiClient.put(API_ROUTES.drafts, { text }, { params: { agentId, instanceId } });
  } catch { /* best-effort */ }
}

export async function clearDraft(key: string): Promise<void> {
  await saveDraft(key, "");
}
