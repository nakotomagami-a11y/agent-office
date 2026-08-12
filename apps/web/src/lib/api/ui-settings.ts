/**
 * API module for the `ui_settings` key/value store — the catch-all bag the UI
 * uses for theme, active project, office layout, Claude limits, etc.
 *
 * Every call to `/api/ui-settings` lives here; callers (Zustand stores, office
 * auto-save, the scene loader) never touch `apiClient` or bare `fetch`.
 */

import { API_ROUTES } from "@agent-office/domain/config/routes";
import { apiClient } from "@/lib/api-client";

export type UiSettings = Record<string, string>;
export type UiSettingsPatch = Record<string, string>;

export async function getUiSettings(): Promise<UiSettings> {
  const res = await apiClient.get<UiSettings>(API_ROUTES.uiSettings);
  return res.data;
}

export async function patchUiSettings(patch: UiSettingsPatch): Promise<void> {
  await apiClient.patch(API_ROUTES.uiSettings, patch);
}
