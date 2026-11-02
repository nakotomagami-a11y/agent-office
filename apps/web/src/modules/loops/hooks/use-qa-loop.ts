"use client";

import type { LoopRow } from "@agent-office/domain/services/db/loops";
import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast-store";
import { useUpdateInstance } from "@/modules/projects/hooks/use-projects";
import { useLatestLoop } from "./use-loop";
import { needsDecision as loopNeedsDecision } from "../format/loop-view";

/** When on, the server starts a review loop after any turn that changed files. */
export function useQaLoopToggle(projectId: string, instanceId: string, enabled: boolean) {
  const t = useTranslations("agent_details");
  const update = useUpdateInstance();
  const toggle = () => {
    const next = !enabled;
    update.mutate(
      { projectId, instanceId, patch: { qaLoopEnabled: next } },
      { onSuccess: () => toast(next ? t("qa_loop_enabled_toast") : t("qa_loop_disabled_toast")) },
    );
  };
  return { toggle, pending: update.isPending };
}

/** The seat's latest loop, or null when there is nothing to show. Hidden once settled with nothing left to
 *  decide, unless the toggle is on — then the last verdict stays in view. */
export function useLatestLoopShown(
  projectId: string | null,
  instanceId: string | null,
  enabled: boolean,
): { loop: LoopRow; updatedAt: number; needsDecision: boolean } | null {
  const { data: loop, dataUpdatedAt } = useLatestLoop(projectId, instanceId);
  if (!loop) return null;
  const needsDecision = loopNeedsDecision(loop, Date.now());
  if (!enabled && loop.state.binding && !needsDecision) return null;
  return { loop, updatedAt: dataUpdatedAt, needsDecision };
}
