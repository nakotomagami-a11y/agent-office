"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TextInput } from "@/components/ui/text-input";
import { QueryState } from "@/components/ui/query-state";
import {
  useGithubAccounts,
  useRenameGithubAccount,
  type GithubAccount,
  type GithubAccountWithStatus,
} from "../hooks/use-github-accounts";
import { AddGithubAccountModal } from "./add-github-account-modal";
import { DeleteGithubAccountModal } from "./delete-github-account-modal";

export function GithubAccountsTab() {
  const accountsQ = useGithubAccounts();
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<GithubAccount | null>(null);

  return (
    <>
      <Card>
        <CardHeader
          title="GitHub accounts"
          sub="Route each project's git pushes through the right GitHub identity. Agents inherit the selected account's gh auth, so pushes land on the correct account."
          right={
            <Button variant="primary" size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={14} />
              <span className="ml-[6px]">Add account</span>
            </Button>
          }
        />
        <div className="p-4 flex flex-col gap-[8px]">
          <QueryState
            result={accountsQ}
            empty={
              <div className="text-[13px] text-txt-3 px-2 py-4">
                No GitHub accounts registered. Add one to get started.
              </div>
            }
          >
            {(accounts) => (
              <div className="flex flex-col gap-[8px]">
                {accounts.map((a) => (
                  <GithubAccountRow key={a.id} account={a} onDelete={() => setDeleting(a)} />
                ))}
              </div>
            )}
          </QueryState>
        </div>
      </Card>

      <AddGithubAccountModal open={addOpen} onClose={() => setAddOpen(false)} />
      <DeleteGithubAccountModal account={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}

function GithubAccountRow({
  account,
  onDelete,
}: {
  account: GithubAccountWithStatus;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(account.label);
  const rename = useRenameGithubAccount();

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === account.label) {
      setEditing(false);
      setDraft(account.label);
      return;
    }
    try {
      await rename.mutateAsync({ id: account.id, label: trimmed });
    } finally {
      setEditing(false);
    }
  };

  const isDefault = account.id === "default";

  return (
    <div className="flex items-center gap-[12px] p-[10px] rounded-[10px] border border-line bg-bg-2">
      <Icon name="branch" size={16} className="text-txt-3 shrink-0" />
      <div className="flex flex-col gap-[3px] flex-1 min-w-0">
        {editing ? (
          <TextInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              } else if (e.key === "Escape") {
                setDraft(account.label);
                setEditing(false);
              }
            }}
            autoFocus
          />
        ) : (
          <div className="flex items-center gap-[8px]">
            <span className="text-[13px] font-semibold text-txt">{account.label}</span>
            {account.username ? (
              <span className="font-mono text-[11px] text-txt-3">@{account.username}</span>
            ) : null}
            {!account.ready && (
              <span className="text-[11px] text-[var(--error)] font-mono uppercase tracking-[0.06em]">
                needs login
              </span>
            )}
          </div>
        )}
        <span className="font-mono text-[11px] text-txt-3 truncate">
          {account.id === "default" ? "~/.config/gh (system)" : account.configDir}
        </span>
      </div>
      {!editing && (
        <div className="flex items-center gap-[4px]">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Icon name="pen" size={12} />
          </Button>
          {!isDefault && (
            <Button size="sm" variant="ghost" onClick={onDelete}>
              <Icon name="trash" size={12} className="text-[var(--error)]" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
