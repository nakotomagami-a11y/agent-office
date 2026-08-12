/**
 * API module for the one-time localStorage → SQLite migration.
 *
 * Every call to the backend lives here; callers (the migration hook) never
 * touch `apiClient` or `fetch` directly. axios serializes `params` for us, so
 * no manual query-string building / encodeURIComponent.
 */

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";

export { patchUiSettings, type UiSettingsPatch } from "./ui-settings";

export interface TranscriptPayload {
  items: string;
  activeRunId: string | null;
  sessionId: string | null;
}

export async function putTranscript(
  agentId: string,
  instanceId: string,
  payload: TranscriptPayload,
): Promise<void> {
  await apiClient.put(API_ROUTES.transcripts, payload, { params: { agentId, instanceId } });
}

export async function putDraft(
  agentId: string,
  instanceId: string,
  text: string,
): Promise<void> {
  await apiClient.put(API_ROUTES.drafts, { text }, { params: { agentId, instanceId } });
}
