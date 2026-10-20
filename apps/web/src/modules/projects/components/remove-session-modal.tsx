"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { WorkChoice } from "@agent-office/domain/config/sessions";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { sessionConflictOf, type SessionAtRisk, type SessionConflict } from "@/lib/api/roster";
import { useRemoveInstance } from "../hooks/use-projects";

/** What a refused removal is about, session by session: the running ones, the work at stake, or git's refusal. */
export function SessionConflictNotice({ conflict }: { conflict: SessionConflict }) {
  const t = useTranslations("session_removal");
  const count = conflict.sessions.length;
  const stakes = (s: SessionAtRisk) =>
    [
      s.uncommitted ? t("uncommitted", { count: s.uncommitted }) : null,
      s.unmerged ? t("unmerged", { count: s.unmerged }) : null,
      s.unknown ? t("unknown") : null,
    ].filter(Boolean).join(" · ");
  const lead =
    conflict.code === "session_running" ? t("running", { count })
    : conflict.code === "session_has_work" ? t("has_work", { count })
    : t("remove_failed", { count });
  return (
    <div className="flex flex-col gap-[6px] text-[12.5px] leading-[1.5] text-txt-2" role="alert">
      <p className="m-0">{lead}</p>
      <ul className="m-0 pl-[18px] flex flex-col gap-[2px]">
        {conflict.sessions.map((s) => (
          <li key={s.instanceId}>
            <span className="font-semibold text-txt">{s.label ?? s.instanceId}</span>
            {s.branch && <span className="font-mono text-[11px] text-txt-3"> {s.branch}</span>}
            {conflict.code === "session_has_work" && <span> — {stakes(s)}</span>}
          </li>
        ))}
      </ul>
      {conflict.code === "session_has_work" && (
        <>
          <p className="m-0 text-txt-3">{t("keep_explainer")}</p>
          <p className="m-0 text-txt-3">{t("discard_explainer")}</p>
        </>
      )}
      {conflict.detail && <p className="m-0 font-mono text-[11px] text-txt-4 break-words">{conflict.detail}</p>}
    </div>
  );
}

export type RemoveSessionTarget = { instanceId: string; name: string };

/** Confirm, then remove one session; a 409 turns the dialog into the keep/discard choice or the reason it cannot go. */
export function RemoveSessionModal({
  projectId,
  projectName,
  target,
  onClose,
  onRemoved,
}: {
  projectId: string | null;
  projectName: string;
  target: RemoveSessionTarget | null;
  onClose: () => void;
  onRemoved?: () => void;
}) {
  const t = useTranslations();
  const removeMut = useRemoveInstance();
  const [conflict, setConflict] = useState<SessionConflict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<WorkChoice | undefined>(undefined);

  useEffect(() => {
    setConflict(null);
    setError(null);
    setChoice(undefined);
  }, [target?.instanceId]);

  const remove = (work: WorkChoice | undefined) => {
    if (!projectId || !target || removeMut.isPending) return;
    setChoice(work);
    setError(null);
    removeMut.mutate(
      { projectId, instanceId: target.instanceId, work },
      {
        onSuccess: () => {
          onClose();
          onRemoved?.();
        },
        onError: (err) => {
          const c = sessionConflictOf(err);
          setConflict(c);
          if (!c) setError(err instanceof Error ? err.message : String(err));
        },
      },
    );
  };

  const choosing = conflict?.code === "session_has_work";
  const busy = removeMut.isPending;

  return (
    <ModalShell
      open={target !== null}
      onClose={busy ? () => undefined : onClose}
      onEnter={choosing ? undefined : () => remove(choice)}
      title={t("session_removal.title")}
      size="md"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          {choosing ? (
            <>
              <Button size="sm" onClick={() => remove("keep")} disabled={busy}>
                {t("session_removal.keep")}
              </Button>
              <Button size="sm" variant="danger" onClick={() => remove("discard")} disabled={busy}>
                {t("session_removal.discard")}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="primary" onClick={() => remove(choice)} disabled={busy}>
              {busy ? "…" : t("session_removal.remove")}
            </Button>
          )}
        </>
      }
    >
      {target && (
        <div className="flex flex-col gap-[12px]">
          <p className="m-0 text-[13px] text-txt-2 leading-[1.55]">
            {t("session_removal.confirm", { name: target.name, project: projectName })}
          </p>
          {conflict && <SessionConflictNotice conflict={conflict} />}
          {error && <p className="m-0 text-[12.5px] text-red" role="alert">{error}</p>}
        </div>
      )}
    </ModalShell>
  );
}
