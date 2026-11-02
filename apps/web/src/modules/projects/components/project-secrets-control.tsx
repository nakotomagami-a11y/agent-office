"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import {
  useSecrets,
  useProjectSecrets,
  useLinkSecret,
  useUnlinkSecret,
} from "@/modules/secrets/hooks/use-secrets";
import { SecretBadges } from "@/modules/secrets/components/secret-badges";
import { SecretFormModal } from "@/modules/secrets/components/secret-form-modal";
import { EnvInfoRow, type EnvIcon } from "./env-control";

const LOCK_ICON: EnvIcon = { src: "/icons/lock.png", alt: "" };

/** Per-project Secrets rows in the Environment card: one flat row per attached secret, then a dashed "attach or create" row. */
export function ProjectSecretsControl({ projectId }: { projectId: string }) {
  const attachedQ = useProjectSecrets(projectId);
  const allQ = useSecrets();
  const link = useLinkSecret(projectId);
  const unlink = useUnlinkSecret(projectId);
  const [formOpen, setFormOpen] = useState(false);

  const attached = attachedQ.data ?? [];
  const attachedIds = new Set(attached.map((s) => s.id));
  const available = (allQ.data ?? []).filter((s) => !attachedIds.has(s.id));

  return (
    <>
      {attached.map((s) => (
        <EnvInfoRow
          key={s.id}
          icon={LOCK_ICON}
          label="Secret"
          value={s.name}
          className="group"
          trailing={
            <div className="flex items-center gap-[8px] shrink-0">
              <SecretBadges secret={s} pillClassName="text-[10.5px] font-bold tracking-normal py-[3px]" />
              <button
                type="button"
                onClick={() => unlink.mutate(s.id)}
                disabled={unlink.isPending}
                aria-label={`Detach ${s.name} from this project`}
                title="Detach from this project"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 flex items-center justify-center w-[20px] h-[20px] rounded-[6px] text-txt-4 cursor-pointer transition-opacity duration-150 hover:text-red hover:bg-red-soft disabled:opacity-50"
              >
                <Icon name="x" size={11} />
              </button>
            </div>
          }
        />
      ))}

      <AttachSecretRow
        available={available}
        onAttach={(id) => link.mutate(id)}
        onCreateNew={() => setFormOpen(true)}
      />

      <SecretFormModal open={formOpen} onClose={() => setFormOpen(false)} onCreated={(secretId) => link.mutate(secretId)} />
    </>
  );
}

function AttachSecretRow({
  available,
  onAttach,
  onCreateNew,
}: {
  available: { id: string; name: string; label: string }[];
  onAttach: (id: string) => void;
  onCreateNew: () => void;
}) {
  const items: DropdownItem[] = [
    ...available.map<DropdownItem>((s) => ({
      key: s.id,
      label: (
        <span className="flex items-baseline gap-[6px] min-w-0">
          <span className="font-mono text-[12px] text-txt truncate">{s.name}</span>
          {s.label ? <span className="text-[11px] text-txt-3 truncate">— {s.label}</span> : null}
        </span>
      ),
      onSelect: () => onAttach(s.id),
    })),
    { key: "__new", label: (
      <span className="flex items-center gap-[6px] text-acc">
        <Icon name="plus" size={12} /> New secret…
      </span>
    ), onSelect: onCreateNew },
  ];

  return (
    <DropdownMenu
      align="start"
      ariaLabel="Attach or create a secret"
      triggerClassName="h-auto w-full rounded-[15px] px-[13px] py-[11px] gap-[10px] bg-transparent border border-dashed border-edge-2 text-txt-3 [transition:border-color_180ms_ease,background-color_180ms_ease,color_180ms_ease,transform_180ms_cubic-bezier(.2,.8,.2,1)] hover:text-acc hover:border-acc-line hover:bg-acc-soft hover:-translate-y-px active:translate-y-0 focus-visible:outline-2 focus-visible:outline-acc focus-visible:outline-offset-2"
      trigger={
        <span className="flex items-center gap-[8px] w-full">
          <Icon name="plus" size={13} className="shrink-0" />
          <span className="flex-1 text-left text-[12.5px] truncate">Attach or create a secret…</span>
        </span>
      }
      items={items}
      variant="popover"
    />
  );
}
