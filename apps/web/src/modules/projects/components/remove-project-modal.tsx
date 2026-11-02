"use client";

import { useEffect, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/lib/api/fetch";
import { useRemoveProjectFolder } from "../hooks/use-projects";

export interface RemovableProject {
  id: string;
  name: string;
  fullPath: string;
}

/**
 * Destructive confirm for permanently deleting a project's folder from disk.
 * This runs `rm -rf` on the actual working directory (not just the app's
 * metadata), so it's gated behind type-to-confirm: the delete button stays
 * disabled until the user types the project's exact name.
 */
export function RemoveProjectModal({
  project,
  onClose,
}: {
  project: RemovableProject | null;
  onClose: () => void;
}) {
  const remove = useRemoveProjectFolder();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset the typed confirmation whenever a different project opens.
  useEffect(() => {
    setConfirm("");
    setError(null);
  }, [project?.id]);

  const matches = !!project && confirm.trim() === project.name;

  const handleConfirm = async () => {
    if (!project || !matches) return;
    setError(null);
    try {
      await remove.mutateAsync({ id: project.id, fullPath: project.fullPath });
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError && e.message === "folder_mismatch"
          ? "This folder is no longer the one the saved projects root lists. Nothing was deleted. Rescan and try again."
          : "Couldn't delete the folder. Check permissions and try again.",
      );
    }
  };

  return (
    <ModalShell
      open={!!project}
      onClose={remove.isPending ? () => {} : onClose}
      size="sm"
      title="Delete project folder"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="gap-[6px] shadow-none disabled:opacity-45 disabled:cursor-not-allowed"
            onClick={() => void handleConfirm()}
            disabled={!matches || remove.isPending}
          >
            <Icon name="trash" size={13} className="w-[13px] h-[13px] [flex:0_0_13px]" />
            {remove.isPending ? "Deleting…" : "Delete folder"}
          </Button>
        </>
      }
    >
      {project ? (
        <div className="flex flex-col gap-[12px]">
          <div className="flex items-center gap-[12px] rounded-[10px] bg-[color-mix(in_srgb,var(--error)_10%,transparent)] p-[12px]">
            <Icon name="shield" size={28} className="w-[28px] h-[28px] [flex:0_0_28px] text-status-error shrink-0" />
            <p className="m-0 text-[12.5px] text-txt-2 leading-[1.5]">
              This permanently deletes the folder and <b>all of its contents</b> from disk. It does
              not go to trash and <b>cannot be undone</b>.
            </p>
          </div>

          <p className="m-0 text-[12.5px] text-txt-3 leading-[1.5]">
            Deleting <span className="font-semibold text-txt">{project.name}</span> at:
          </p>
          <code className="block font-mono text-[11.5px] text-txt-2 bg-card-2 rounded-[12px] px-[14px] py-[12px] break-all">
            {project.fullPath}
          </code>

          <label className="flex flex-col gap-[6px]">
            <span className="text-[12px] text-txt-3">
              Type <span className="font-mono font-semibold text-txt">{project.name}</span> to confirm
            </span>
            <TextInput
              variant="soft"
              className="h-[42px]"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && matches) {
                  e.preventDefault();
                  void handleConfirm();
                }
              }}
              placeholder={project.name}
              autoFocus
            />
          </label>

          {error ? <p className="m-0 text-[12px] text-status-error">{error}</p> : null}
        </div>
      ) : null}
    </ModalShell>
  );
}
