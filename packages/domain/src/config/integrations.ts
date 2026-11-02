// Integration registry — the app's optional, toggleable integrations, gated server-side via
// requireIntegration() and client-side by settings.integrations. The first-run wizard lists every
// entry; Settings → Integrations (integrations-tab.tsx) renders only the kinds it has a card for.

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
] as const satisfies readonly IntegrationDef[];

export function getIntegration(id: string): IntegrationDef | undefined {
  return INTEGRATIONS.find((i) => i.id === id);
}
