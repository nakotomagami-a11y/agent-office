// The office-layout ui_settings keys, defined once. Save import/export and the
// ui-settings allow-list all reference these; keeping the set here stops the
// four call sites from drifting. Maps a bundle field name → ui_settings key.
export const OFFICE_SETTING_KEYS = {
  grid: "office-grid",
  decorations: "office-decorations",
  agents: "office-agents",
  grassColor: "office-grass-color",
} as const;

export type OfficeSettingField = keyof typeof OFFICE_SETTING_KEYS;
