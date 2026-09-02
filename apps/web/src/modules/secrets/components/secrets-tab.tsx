"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { QueryState } from "@/components/ui/query-state";
import { relativeTime } from "@/modules/projects/format/format";
import {
  useSecrets,
  useDeleteSecret,
  useTestSecret,
  type SecretWithStatus,
} from "../hooks/use-secrets";
import { SecretBadges } from "./secret-badges";
import { SecretFormModal } from "./secret-form-modal";

export function SecretsTab() {
  const secretsQ = useSecrets();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SecretWithStatus | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (s: SecretWithStatus) => {
    setEditing(s);
    setFormOpen(true);
  };

  const count = secretsQ.data?.length ?? 0;

  return (
    <>
      <div className="relative overflow-hidden rounded-[22px] surface-sheen shadow-[var(--lift)] px-[22px] py-[20px]">
        <div
          className="absolute -right-[60px] -top-[90px] w-[280px] h-[220px] pointer-events-none"
          style={{ background: "radial-gradient(circle at 50% 50%, rgba(34,211,238,.12), transparent 66%)" }}
          aria-hidden
        />
        <div className="relative flex items-center gap-[18px]">
          <div className="flex-1 min-w-0">
            <div className="text-[19px] font-extrabold tracking-[-0.025em]">Secrets</div>
            <div className="text-[12px] leading-[1.6] text-txt-3 mt-[6px] max-w-[520px] text-pretty">
              Access tokens stored as named environment variables. Attach one to a project and
              every agent run there gets it injected. Values never leave this device.
            </div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-[8px] py-[11px] px-[18px] rounded-[14px] bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[13px] font-bold whitespace-nowrap cursor-pointer shadow-[0_14px_30px_-14px_rgba(139,123,255,0.9)] transition-transform duration-150 hover:-translate-y-[2px] shrink-0"
          >
            <Icon name="plus" size={14} /> Add secret
          </button>
        </div>
      </div>

      <div className="mt-[14px] rounded-[22px] surface-sheen shadow-[var(--lift)] overflow-hidden">
        <div className="flex items-center gap-[10px] px-[20px] py-[11px] border-b border-edge bg-card-2">
          <span className="text-[9.5px] font-extrabold tracking-[0.09em] uppercase text-txt-4 whitespace-nowrap">
            {count} secret{count === 1 ? "" : "s"}
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[10px] text-txt-4 whitespace-nowrap">AES-256 · encrypted at rest</span>
        </div>

        <QueryState
          result={secretsQ}
          empty={
            <div className="text-[12.5px] text-txt-3 px-[20px] py-[20px]">
              No secrets yet. Add one, then attach it to a project from the project page.
            </div>
          }
        >
          {(list) =>
            list.length === 0 ? (
              <div className="text-[12.5px] text-txt-3 px-[20px] py-[20px]">
                No secrets yet. Add one, then attach it to a project from the project page.
              </div>
            ) : (
              <div className="flex flex-col">
                {list.map((s) => (
                  <SecretRow key={s.id} secret={s} onEdit={() => openEdit(s)} />
                ))}
              </div>
            )
          }
        </QueryState>

        <div className="flex items-center gap-[10px] px-[20px] py-[13px] bg-card-2">
          <span className="font-mono text-[10.5px] text-txt-4 whitespace-nowrap">
            values are injected as env vars at run start and never written to logs
          </span>
        </div>
      </div>

      <SecretFormModal open={formOpen} onClose={() => setFormOpen(false)} secret={editing} />
    </>
  );
}

function Dot() {
  return <span className="w-[3px] h-[3px] rounded-full bg-txt-4 opacity-60" aria-hidden />;
}

function SecretRow({ secret, onEdit }: { secret: SecretWithStatus; onEdit: () => void }) {
  const del = useDeleteSecret();
  const test = useTestSecret();
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const runTest = async () => {
    setTestMsg(null);
    try {
      const r = await test.mutateAsync(secret.id);
      if (r.skipped) setTestMsg("No test command set for this secret.");
      else setTestMsg(r.ok ? "✓ Valid" : `✗ Failed: ${r.output.trim().slice(0, 160)}`);
    } catch (e) {
      setTestMsg(`✗ ${(e as Error).message}`);
    }
  };

  return (
    <div className="flex flex-col border-b border-edge transition-colors duration-150 hover:bg-card-2">
      <div className="flex items-center gap-[13px] px-[20px] py-[13px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/lock.png" alt="" width={32} height={32} className="shrink-0 object-contain" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-[9px]">
            <span className="font-mono text-[12.5px] font-bold whitespace-nowrap overflow-hidden text-ellipsis">
              {secret.name}
            </span>
            <SecretBadges secret={secret} />
          </div>
          <div className="flex items-center gap-[9px] mt-[5px]">
            {secret.label ? (
              <span className="text-[11px] text-txt-3 whitespace-nowrap">{secret.label}</span>
            ) : null}
            {secret.label && secret.projectCount > 0 ? <Dot /> : null}
            {secret.projectCount > 0 ? (
              <span className="font-mono text-[10.5px] text-txt-4 whitespace-nowrap">
                {secret.projectCount} project{secret.projectCount === 1 ? "" : "s"}
              </span>
            ) : null}
            {secret.lastTestedAt ? (
              <>
                <Dot />
                <span className="font-mono text-[10.5px] text-txt-4 whitespace-nowrap">
                  tested {relativeTime(secret.lastTestedAt)}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-[6px] shrink-0">
          <button
            type="button"
            onClick={runTest}
            disabled={test.isPending}
            title="Run test command"
            className="w-[30px] h-[30px] flex items-center justify-center rounded-[10px] bg-card-2 border border-edge text-txt-4 cursor-pointer transition-all duration-150 hover:text-txt hover:border-txt-4 disabled:opacity-50"
          >
            <Icon name="check" size={13} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            title="Edit"
            className="w-[30px] h-[30px] flex items-center justify-center rounded-[10px] bg-card-2 border border-edge text-txt-4 cursor-pointer transition-all duration-150 hover:text-txt hover:border-txt-4"
          >
            <Icon name="pen" size={12} />
          </button>
          <button
            type="button"
            onClick={() => del.mutate(secret.id)}
            disabled={del.isPending}
            title="Delete secret"
            className="w-[30px] h-[30px] flex items-center justify-center rounded-[10px] bg-card-2 border border-edge text-txt-4 cursor-pointer transition-all duration-150 hover:text-red hover:border-red disabled:opacity-50"
          >
            <Icon name="trash" size={12} />
          </button>
        </div>
      </div>
      {testMsg ? (
        <span className="font-mono text-[11px] text-txt-3 px-[20px] pb-[13px] pl-[65px] break-words">{testMsg}</span>
      ) : null}
    </div>
  );
}
