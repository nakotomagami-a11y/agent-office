"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "@agent-office/domain/hooks/api";
import { Icon } from "@/components/ui/icon";
import { useLoop, useLoopAction, type LoopAction } from "../hooks/use-loop";
import { availableActions, ceilingPressure, phaseLabel, sortedOpen } from "../format/loop-view";

/**
 * A loop is a bounded CYCLE, not a spawn tree — so this reuses WorkflowPill's
 * shape (compact header affordance -> expandable detail) but not WorkflowNode,
 * which models causality. Content is progress: which round, how close to the
 * binding ceiling, what is still open, and the three interventions.
 */
export function LoopPill({ loopId }: { loopId: string }) {
  const { data: loop } = useLoop(loopId);
  const act = useLoopAction(loopId);
  const [open, setOpen] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // A refusal describes one snapshot. Once the loop moves on it is a red
  // message about a phase that no longer exists.
  useEffect(() => { setRefusal(null); }, [loop?.updatedAt]);

  // Outside-click AND Escape. WorkflowPill only does the former; a panel a
  // keyboard user cannot dismiss is a trap (WCAG 2.1.1).
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!loop) return null;

  const pressure = ceilingPressure(loop);
  const can = availableActions(loop, Date.now());
  const openFindings = sortedOpen(loop);
  const settled = !!loop.state.binding;
  const blocked = loop.state.phase === "escalated";

  const run = (action: LoopAction) => {
    setRefusal(null);
    act.mutate(action, {
      // A 409 means the machine refused; say so rather than appearing to work.
      // apiFetch builds `message` from the envelope's `error` key only, so the
      // remediation lives on `.data` — without this the user sees the raw
      // snake_case code and the whole refusalDetail table is unreachable.
      onError: (e: unknown) => {
        const detail = e instanceof ApiError && typeof (e.data as { detail?: unknown })?.detail === "string"
          ? (e.data as { detail: string }).detail
          : null;
        setRefusal(detail ?? "That action no longer applies.");
      },
      onSuccess: () => setRefusal(null),
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Loop: ${phaseLabel(loop.state.phase)}, ${pressure.label}`}
        className="inline-flex items-center gap-[7px] h-7 px-[10px] rounded-lg bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 text-[12.5px] transition-[background,color,border-color] duration-[120ms] hover:bg-ao-bg-4 hover:text-ao-fg-0 hover:border-ao-line-2"
      >
        <Icon name={settled ? (blocked ? "alert-circle" : "check") : "refresh"} className="w-3.5 h-3.5" />
        <span>{phaseLabel(loop.state.phase)}</span>
        <span className="text-ao-fg-2">{pressure.label}</span>
        {openFindings.length > 0 && (
          <span className="px-1.5 rounded bg-ao-bg-4 text-ao-fg-0">{openFindings.length}</span>
        )}
      </button>

      {open && (
        <div id={panelId} className="absolute right-0 z-30 mt-1.5 w-[420px] rounded-xl border border-ao-line-1 bg-ao-bg-2 p-3 shadow-lg">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] text-ao-fg-0">{loop.goal}</p>
          </div>

          <div className="mt-2.5">
            <div className="flex items-center justify-between text-[11.5px] text-ao-fg-2">
              <span>{pressure.label}</span>
              <span>{loop.state.spentUsd > 0 ? `$${loop.state.spentUsd.toFixed(2)} spent` : ""}</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-ao-bg-4">
              <div
                className="h-1.5 rounded-full bg-ao-acc transition-[width] duration-200"
                style={{ width: `${Math.min(100, Math.round(pressure.fraction * 100))}%` }}
              />
            </div>
          </div>

          {loop.state.binding && (
            <p className="mt-2.5 text-[12px] text-ao-fg-1">
              {/* The binding constraint is the whole point: "converged at 3 of 5"
                  and "stopped at 5 of 5 with 2 open" are different outcomes. */}
              <span className="text-ao-fg-2">Stopped on</span> {loop.state.binding.replace(/_/g, " ")}
            </p>
          )}

          {/* tabIndex: a scroll container a keyboard user cannot reach is unusable. */}
          <ul tabIndex={0} className="mt-2.5 flex flex-col gap-1.5 max-h-[220px] overflow-y-auto">
            {openFindings.length === 0 && (
              <li className="text-[12px] text-ao-fg-2">No blocking findings open.</li>
            )}
            {openFindings.map((f, i) => (
              <li key={`${f.ruleId}-${i}`} className="rounded-lg border border-ao-line-1 bg-ao-bg-3 p-2">
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className={f.severity === "must-fix" ? "text-ao-red" : "text-ao-fg-2"}>{f.severity}</span>
                  <code className="text-ao-fg-1">{f.ruleId}</code>
                </div>
                <p className="mt-0.5 text-[12px] text-ao-fg-0">{f.why}</p>
                {f.file && (
                  <p className="mt-0.5 text-[11px] text-ao-fg-2">
                    {f.file}{f.line ? `:${f.line}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {refusal && <p className="mt-2 text-[11.5px] text-ao-red">{refusal}</p>}

          <div className="mt-3 flex items-center gap-2">
            {can.stop && <Action label="Stop" onClick={() => run("stop")} busy={act.isPending} />}
            {can.acceptAsIs && <Action label="Accept as-is" onClick={() => run("acceptAsIs")} busy={act.isPending} />}
            {can.allowOneMore && <Action label="Allow one more round" onClick={() => run("allowOneMore")} busy={act.isPending} />}
          </div>
        </div>
      )}
    </div>
  );
}

function Action({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="h-7 px-2.5 rounded-lg border border-ao-line-1 bg-ao-bg-3 text-[12px] text-ao-fg-1 transition-[background,color] duration-[120ms] hover:bg-ao-bg-4 hover:text-ao-fg-0 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
