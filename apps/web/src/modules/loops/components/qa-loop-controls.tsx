"use client";

import { useTranslations } from "next-intl";
import { Tooltip } from "@/components/ui/tooltip";
import { toast } from "@/lib/toast-store";
import { cn } from "@/lib/cn";
import { useUpdateInstance } from "@/modules/projects/hooks/use-projects";
import { useLatestLoop } from "../hooks/use-loop";
import { availableActions } from "../format/loop-view";
import { LoopPill } from "./loop-pill";

/** Header toggle, styled as the playwright one beside it. When on, the server
 *  starts a review loop after any turn that changed files. */
export function QaLoopToggle({ projectId, instanceId, enabled }: { projectId: string; instanceId: string; enabled: boolean }) {
  const t = useTranslations("agent_details");
  const update = useUpdateInstance();
  const toggle = () => {
    const next = !enabled;
    update.mutate(
      { projectId, instanceId, patch: { qaLoopEnabled: next } },
      { onSuccess: () => toast(next ? t("qa_loop_enabled_toast") : t("qa_loop_disabled_toast")) },
    );
  };
  return (
    <Tooltip content={enabled ? t("qa_loop_on_tooltip") : t("qa_loop_off_tooltip")} side="bottom" delayMs={400}>
      <button
        type="button"
        aria-pressed={enabled}
        onClick={toggle}
        disabled={update.isPending}
        className={cn(
          "inline-flex items-center gap-[6px] h-[24px] px-[10px] rounded-[9px] font-mono text-[11.5px] font-semibold transition-colors duration-[120ms] disabled:opacity-50",
          enabled
            ? "text-ao-fg-2 bg-ao-bg-2 shadow-[inset_0_0_0_1px_var(--ao-line-0)] hover:text-ao-fg-0 hover:shadow-[inset_0_0_0_1px_var(--ao-line-1)]"
            : "text-[var(--ao-fg-3)] bg-transparent shadow-[inset_0_0_0_1px_var(--ao-line-0)] hover:text-ao-fg-1",
        )}
      >
        <span
          className={cn(
            "w-[6px] h-[6px] rounded-full shrink-0",
            enabled ? "bg-[var(--ao-ok)] shadow-[0_0_5px_var(--ao-ok)]" : "bg-[var(--ao-fg-3)]",
          )}
          aria-hidden
        />
        <span>{enabled ? t("qa_loop_on_label") : t("qa_loop_off_label")}</span>
      </button>
    </Tooltip>
  );
}

/** The seat's latest loop. Hidden once settled with nothing left to decide,
 *  unless the toggle is on — then the last verdict stays in view. */
export function LatestLoopPill({ instanceId, enabled }: { instanceId: string; enabled: boolean }) {
  const { data: loop } = useLatestLoop(instanceId);
  if (!loop) return null;
  const can = availableActions(loop, Date.now());
  if (!enabled && loop.state.binding && !can.acceptAsIs && !can.allowOneMore) return null;
  return <LoopPill loopId={loop.id} />;
}
