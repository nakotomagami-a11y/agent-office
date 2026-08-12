"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { Popover } from "@/components/ui/popover";
import {
  useSecrets,
  useProjectSecrets,
  useLinkSecret,
  useUnlinkSecret,
} from "@/modules/secrets/hooks/use-secrets";
import { SecretBadges } from "@/modules/secrets/components/secret-badges";
import { SecretFormModal } from "@/modules/secrets/components/secret-form-modal";
import { EnvControlTrigger, ENV_CONTROL_TRIGGER } from "./env-control";

/**
 * Per-project Secrets control — the third button in the project Environment bar.
 *
 * Replaces the old standalone Secrets card: the same body (attached list +
 * "attach existing" + "new") now lives in a popover anchored to the header, so
 * the keys a project holds are one click from the top of the page instead of a
 * scroll away. Only names/counts are shown here — raw values stay DB-only and
 * reach agents solely as injected env vars.
 */
export function ProjectSecretsControl({ projectId }: { projectId: string }) {
  const attachedQ = useProjectSecrets(projectId);
  const allQ = useSecrets();
  const link = useLinkSecret(projectId);
  const unlink = useUnlinkSecret(projectId);
  const [formOpen, setFormOpen] = useState(false);

  const attached = attachedQ.data ?? [];
  const count = attached.length;
  const attachedIds = new Set(attached.map((s) => s.id));
  const available = (allQ.data ?? []).filter((s) => !attachedIds.has(s.id));

  const valueLabel = count === 0 ? "None" : `${count} attached`;

  const trigger = (
    <EnvControlTrigger icon="lock" label="Secrets" value={valueLabel} />
  );

  return (
    <>
      <Popover
        align="start"
        width={340}
        ariaLabel={`Project secrets, ${count} attached`}
        triggerClassName={ENV_CONTROL_TRIGGER}
        trigger={trigger}
      >
        {({ close }) => (
          <div className="flex flex-col">
            <div className="flex items-center gap-[10px] px-[14px] py-[11px] border-b border-line">
              <div className="flex items-center justify-center bg-bg-2 border border-line text-txt-2 shrink-0 w-[26px] h-[26px] rounded-[7px]">
                <Icon name="lock" size={13} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-txt text-[13px] leading-tight">Secrets</div>
                <div className="text-txt-3 font-[var(--font-mono)] text-[10px] mt-[1px]">
                  env vars injected into every agent run
                </div>
              </div>
              <Button size="sm" variant="ghost" className="shrink-0" onClick={() => { close(); setFormOpen(true); }}>
                <Icon name="plus" size={13} />
                <span className="ml-[4px]">New</span>
              </Button>
            </div>

            <div className="px-[14px] py-[12px] flex flex-col gap-[10px]">
              {count === 0 ? (
                <div className="text-[12.5px] text-txt-3">
                  No secrets attached to this project yet.
                </div>
              ) : (
                <div className="flex flex-col gap-[6px]">
                  {attached.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-[9px] p-[7px_9px] rounded-[8px] border border-line bg-bg-2"
                    >
                      <Icon name="lock" size={13} className="text-txt-3 shrink-0" />
                      <div className="flex flex-col gap-[2px] min-w-0 flex-1">
                        <div className="flex items-center gap-[7px] flex-wrap">
                          <span className="font-[var(--font-mono)] text-[12px] font-semibold text-txt truncate">
                            {s.name}
                          </span>
                          {s.label ? (
                            <span className="text-[11px] text-txt-3 truncate">{s.label}</span>
                          ) : null}
                        </div>
                        <SecretBadges secret={s} />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        aria-label={`Detach ${s.name} from this project`}
                        title="Detach from this project"
                        onClick={() => unlink.mutate(s.id)}
                        disabled={unlink.isPending}
                      >
                        <Icon name="x" size={12} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {available.length > 0 ? (
                <DropdownMenu
                  align="start"
                  ariaLabel="Attach an existing secret"
                  className="w-full"
                  triggerClassName="w-full h-8 !px-[10px] bg-bg-1 border border-line-2 rounded-md text-txt-2 text-[13px] hover:bg-bg-2 hover:border-line-strong"
                  trigger={
                    <span className="flex items-center gap-[8px] w-full">
                      <Icon name="plus" size={12} className="shrink-0" />
                      <span className="flex-1 text-left truncate">Attach an existing secret…</span>
                      <Icon name="chevron-down" size={12} className="shrink-0 text-txt-3" />
                    </span>
                  }
                  items={available.map<DropdownItem>((s) => ({
                    key: s.id,
                    label: (
                      <span className="flex items-baseline gap-[6px] min-w-0">
                        <span className="font-[var(--font-mono)] text-[12px] text-txt truncate">
                          {s.name}
                        </span>
                        {s.label ? (
                          <span className="text-[11px] text-txt-3 truncate">— {s.label}</span>
                        ) : null}
                      </span>
                    ),
                    onSelect: () => link.mutate(s.id),
                  }))}
                />
              ) : null}
            </div>
          </div>
        )}
      </Popover>

      <SecretFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={(secretId) => link.mutate(secretId)}
      />
    </>
  );
}
