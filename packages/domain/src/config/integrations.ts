// Integration registry — the single source of truth for the app's optional,
// toggleable integrations. Surfaced in Settings → Integrations and the first-run
// wizard; gated server-side via requireIntegration() and client-side by reading
// settings.integrations. Adding an entry here is all it takes to add a toggle.

export type IntegrationStatus = "stable" | "experimental";

export interface IntegrationDef {
  /** Stable key stored in settings.integrations and checked by requireIntegration. */
  id: string;
  label: string;
  description: string;
  status: IntegrationStatus;
  /** Enabled state when the user has never toggled it (also the fresh-install default). */
  defaultEnabled: boolean;
  /** Web IconName (see apps/web/src/components/ui/icon). */
  icon: string;
}

export const INTEGRATIONS = [
  {
    id: "github",
    label: "GitHub",
    description: "Manage multiple GitHub accounts and authenticate git operations per project.",
    status: "stable",
    defaultEnabled: true,
    icon: "branch",
  },
  {
    id: "flutter",
    label: "Flutter",
    description: "Run, mirror, and screenshot Flutter apps on connected devices and emulators from a project.",
    status: "stable",
    defaultEnabled: false,
    icon: "smartphone",
  },
  {
    id: "iso-view",
    label: "Isometric view",
    description: "Render the office as a 3D isometric floor (PixiJS). Early development — expect rough edges.",
    status: "experimental",
    defaultEnabled: false,
    icon: "layers",
  },
  {
    id: "about-you",
    label: "About You",
    description: "A candid, evidence-based profile of how you work, generated locally from your usage by the user-analyst agent.",
    status: "experimental",
    defaultEnabled: false,
    icon: "identity",
  },
] as const satisfies readonly IntegrationDef[];

export type IntegrationId = (typeof INTEGRATIONS)[number]["id"];

export function getIntegration(id: string): IntegrationDef | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}
