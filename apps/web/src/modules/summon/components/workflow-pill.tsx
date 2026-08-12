"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import type { WorkflowNode } from "@agent-office/domain/types";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/modules/runs/components/status-badge";
import { formatCost, formatDuration } from "@/modules/runs/format/format-run-meta";
import { useWorkflowTree } from "../hooks/use-workflow-tree";
import { countDescendants } from "../format/workflow-tree";

/**
 * Header affordance that surfaces the live sub-agent spawn tree for the active
 * run. Renders nothing until the tree has at least one descendant. Clicking the
 * pill opens a git-worktree-style dropdown of every spawned agent.
 */
export function WorkflowPill({ runId, active }: { runId: string; active: boolean }) {
  const { data: tree } = useWorkflowTree(runId, { active });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!tree || tree.children.length === 0) return null;

  const counts = countDescendants(tree);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-[7px] h-7 px-[10px] rounded-lg bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 text-[12.5px] transition-[background,color,border-color] duration-[120ms] hover:bg-ao-bg-4 hover:text-ao-fg-0 hover:border-ao-line-2"
      >
        <Icon name="branch" size={13} />
        <span className="font-medium">Workflow</span>
        <span className="font-mono text-[11px] text-ao-fg-3">{counts.total}</span>
        {counts.running > 0 && (
          <span className="inline-flex items-center gap-[4px] font-mono text-[10.5px] text-[var(--ao-ok)]">
            <span className="w-[5px] h-[5px] rounded-full bg-[var(--ao-ok)] animate-[ao-pulse_1.5s_infinite]" aria-hidden />
            {counts.running}
          </span>
        )}
        <Icon name="chevron" size={11} className={open ? "rotate-90 transition-transform" : "transition-transform"} />
      </button>

      {open && (
        <div className="absolute right-0 top-[34px] z-30 w-[min(440px,calc(100vw-36px))] max-h-[60vh] overflow-y-auto rounded-[12px] border border-ao-line-2 bg-ao-bg-1 shadow-[var(--shadow-2)] p-[10px]">
          <div className="flex items-center justify-between px-[4px] pb-[8px] mb-[6px] border-b border-ao-line-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ao-fg-3">Spawn tree</span>
            <span className="font-mono text-[10.5px] text-ao-fg-3">
              {counts.running > 0 ? `${counts.running} running · ${counts.done} done` : `${counts.total} agents · all done`}
            </span>
          </div>
          <div className="flex flex-col gap-[4px]">
            {tree.children.map((child) => (
              <WorkflowRow key={child.runId} node={child} depth={0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowRow({ node, depth }: { node: WorkflowNode; depth: number }) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="group flex items-center gap-[8px] rounded-[7px] px-[8px] py-[6px] cursor-pointer hover:bg-ao-bg-2 transition-[background] duration-[120ms]"
        style={{ marginLeft: depth * 14 }}
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        <span className="text-ao-fg-4 font-mono text-[11px] select-none" aria-hidden>
          {depth > 0 ? "└" : "•"}
        </span>
        <StatusBadge status={node.status} />
        <span className="text-[12.5px] text-ao-fg-0 font-medium truncate flex-1 min-w-0">{node.agentName}</span>
        {node.durMs > 0 && (
          <span className="font-mono text-[11px] text-ao-fg-3 shrink-0">{formatDuration(node.durMs)}</span>
        )}
        {node.cost > 0 && (
          <span className="font-mono text-[11px] text-ao-fg-3 shrink-0">{formatCost(node.cost)}</span>
        )}
        <Icon name="chevron" size={11} className={`text-ao-fg-3 shrink-0 ${open ? "rotate-90" : ""} transition-transform`} />
      </div>

      {open && (
        <div className="flex flex-col gap-[8px] px-[10px] py-[8px] mb-[4px]" style={{ marginLeft: depth * 14 + 18 }}>
          {node.prompt && (
            <div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ao-fg-3 mb-[3px]">Prompt</div>
              <div className="font-mono text-[11.5px] text-ao-fg-1 whitespace-pre-wrap break-words leading-[1.5] max-h-[120px] overflow-y-auto">
                {node.prompt}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-ao-fg-3">
              {node.tokensIn.toLocaleString()}↓ / {node.tokensOut.toLocaleString()}↑ tok
            </span>
            <Link
              href={PAGE_ROUTES.run(node.runId)}
              className="inline-flex items-center gap-[5px] text-[11.5px] text-[var(--ao-accent)] font-medium no-underline hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Open full transcript
              <Icon name="chevron" size={11} className="rotate-[-90deg]" />
            </Link>
          </div>
        </div>
      )}

      {hasChildren && (
        <div className="flex flex-col gap-[4px]">
          {node.children.map((child) => (
            <WorkflowRow key={child.runId} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
