"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { QueryState } from "@/components/ui/query-state";
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

  return (
    <>
      <Card>
        <CardHeader
          title="Secrets"
          sub="Store access tokens (Vercel, OpenAI, …) as named env vars. Attach a secret to a project and every agent run there gets it injected. Values live only on this device."
          right={
            <Button variant="primary" size="sm" className="shrink-0 whitespace-nowrap" onClick={openCreate}>
              <Icon name="plus" size={14} />
              <span className="ml-[6px]">Add secret</span>
            </Button>
          }
        />
        <div className="p-4">
          <QueryState
            result={secretsQ}
            empty={
              <div className="text-[13px] text-txt-3 px-2 py-4">
                No secrets yet. Add one, then attach it to a project from the project page.
              </div>
            }
          >
            {(list) =>
              list.length === 0 ? (
                <div className="text-[13px] text-txt-3 px-2 py-4">
                  No secrets yet. Add one, then attach it to a project from the project page.
                </div>
              ) : (
                <div className="flex flex-col gap-[8px]">
                  {list.map((s) => (
                    <SecretRow key={s.id} secret={s} onEdit={() => openEdit(s)} />
                  ))}
                </div>
              )
            }
          </QueryState>
        </div>
      </Card>

      <SecretFormModal open={formOpen} onClose={() => setFormOpen(false)} secret={editing} />
    </>
  );
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
    <div className="flex flex-col gap-[6px] p-[10px] rounded-[10px] border border-line bg-bg-2">
      <div className="flex items-center gap-[12px]">
        <Icon name="lock" size={16} className="text-txt-3 shrink-0" />
        <div className="flex flex-col gap-[3px] flex-1 min-w-0">
          <div className="flex items-center gap-[8px] flex-wrap">
            <span className="font-mono text-[12.5px] font-semibold text-txt">{secret.name}</span>
            {secret.label ? <span className="text-[12px] text-txt-3">{secret.label}</span> : null}
            {secret.projectCount > 0 ? (
              <span className="text-[11px] text-txt-4 font-mono">
                {secret.projectCount} project{secret.projectCount === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <SecretBadges secret={secret} />
        </div>
        <div className="flex items-center gap-[4px] shrink-0">
          <Button size="sm" variant="ghost" onClick={runTest} disabled={test.isPending} title="Run test command">
            <Icon name="check" size={13} />
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Icon name="pen" size={12} />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => del.mutate(secret.id)} disabled={del.isPending}>
            <Icon name="trash" size={12} className="text-[var(--error)]" />
          </Button>
        </div>
      </div>
      {testMsg ? (
        <span className="font-mono text-[11px] text-txt-3 pl-[28px] break-words">{testMsg}</span>
      ) : null}
    </div>
  );
}
