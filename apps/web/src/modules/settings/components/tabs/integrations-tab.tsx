"use client";

import { INTEGRATIONS } from "@agent-office/domain/config/integrations";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings, usePatchSettings } from "../../hooks/use-settings";
import { IntegrationRow } from "../integration-row";

/**
 * Integrations tab — one toggle per entry in the integration registry. Toggling
 * merge-patches settings.integrations; the registry's defaultEnabled is used when
 * an integration has never been toggled. Adding a registry entry adds a row here
 * automatically.
 */
export function IntegrationsTab() {
  const settingsQ = useSettings();
  const patchMut = usePatchSettings();

  if (settingsQ.isLoading) return <Skeleton width="100%" height={180} />;

  const stored = settingsQ.data?.integrations ?? {};

  return (
    <Card>
      <CardHeader
        title="Integrations"
        sub="Enable the parts of the app you need. Disabling an integration hides its UI and turns off its routes — your data is kept."
      />
      <div className="p-4 flex flex-col gap-2">
        {INTEGRATIONS.map((def) => (
          <IntegrationRow
            key={def.id}
            def={def}
            enabled={stored[def.id] ?? def.defaultEnabled}
            disabled={patchMut.isPending}
            onToggle={(next) => patchMut.mutate({ integrations: { [def.id]: next } })}
          />
        ))}
      </div>
    </Card>
  );
}
