"use client";

/**
 * Cleanup panel — surgical resets nested inside the Performance tab.
 *
 * Each button opens a confirm modal describing exactly what the action
 * touches; nothing runs on first click. Analytics data (runs history, cost,
 * token totals) is preserved across all rows except "Everything", which
 * shows a stronger double-confirm warning.
 */

import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/cn";
import { useCleanup, type CleanupKind, type CleanupResult } from "../../hooks/use-cleanup";

interface CleanupRow {
  kind: CleanupKind;
  label: string;
  description: string;
  icon: IconName;
  destructive?: boolean;
}

const ROWS: CleanupRow[] = [
  {
    kind: "transcripts",
    label: "Reset chat transcripts",
    description:
      "Empties every chat panel. Runs history and analytics are kept.",
    icon: "eye",
  },
  {
    kind: "drafts",
    label: "Clear composer drafts",
    description:
      "Discards every in-progress prompt sitting in a composer.",
    icon: "pen",
  },
  {
    kind: "orphaned-runs",
    label: "Wipe orphaned recovered runs",
    description:
      "Deletes runs marked error/-1 and pipelines with interrupted=1 — the ones left over from an app crash or forced kill.",
    icon: "refresh",
  },
  {
    kind: "agent-memory",
    label: "Reset agent memory files",
    description:
      "Removes every ~/.claude/agents/<agent-id>.memory.md. The global memory file is preserved.",
    icon: "memory",
  },
  {
    kind: "user-analysis",
    label: "Reset User Analysis file",
    description:
      "Deletes the About You dossier. Regenerates on the next user-analyst run.",
    icon: "identity",
  },
  {
    kind: "skill-cache",
    label: "Clear skill install cache",
    description:
      "Wipes every installed skill under ~/.claude/agents/_skills/. Reinstall on next use.",
    icon: "sparkle",
  },
  {
    kind: "ui-settings",
    label: "Reset app UI settings",
    description:
      "Clears theme, layout, tab persistence, and other UI-only knobs. Migration sentinel is kept so the DB doesn't re-migrate.",
    icon: "settings",
  },
  {
    kind: "everything",
    label: "Everything",
    description:
      "⚠ Bulk nuke — every row above PLUS runs, messages, tool_calls, and pipeline history. Analytics data is destroyed.",
    icon: "trash",
    destructive: true,
  },
];

// ─── Row ─────────────────────────────────────────────────────────────────────

function Row({ row, onRun }: { row: CleanupRow; onRun: () => void }) {
  return (
    <div
      className={cn(
        "flex items-start gap-[12px] p-[12px] rounded-[10px] border",
        row.destructive
          ? "border-[color-mix(in_oklch,var(--error)_35%,transparent)] bg-[color-mix(in_oklch,var(--error)_4%,transparent)]"
          : "border-line bg-bg-2",
      )}
    >
      <Icon
        name={row.icon}
        size={16}
        className={cn(
          "mt-[3px] shrink-0",
          row.destructive ? "text-[var(--error)]" : "text-txt-3",
        )}
      />
      <div className="flex flex-col gap-[4px] flex-1 min-w-0">
        <div
          className={cn(
            "text-[13px] font-semibold",
            row.destructive ? "text-[var(--error)]" : "text-txt",
          )}
        >
          {row.label}
        </div>
        <div className="text-[12px] text-txt-3 leading-[1.5]">
          {row.description}
        </div>
      </div>
      <Button
        size="sm"
        variant={row.destructive ? "primary" : "ghost"}
        className={row.destructive ? "!bg-[var(--error)] !text-white" : ""}
        onClick={onRun}
      >
        {row.destructive ? "Nuke" : "Run"}
      </Button>
    </div>
  );
}

// ─── Confirm modal ───────────────────────────────────────────────────────────

function ConfirmModal({
  row,
  onCancel,
  onConfirm,
  pending,
  lastResult,
}: {
  row: CleanupRow | null;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  lastResult: CleanupResult | null;
}) {
  const [doubleConfirm, setDoubleConfirm] = useState(false);

  const canConfirm =
    !row?.destructive || (row.destructive && doubleConfirm);

  return (
    <ModalShell
      open={!!row}
      onClose={() => {
        setDoubleConfirm(false);
        onCancel();
      }}
      title={row?.label ?? ""}
      size="sm"
      footer={
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDoubleConfirm(false);
              onCancel();
            }}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!canConfirm || pending}
            className={row?.destructive ? "!bg-[var(--error)] !text-white" : ""}
            onClick={onConfirm}
          >
            {pending ? "Working…" : row?.destructive ? "Nuke everything" : "Run"}
          </Button>
        </>
      }
    >
      {row && (
        <div className="flex flex-col gap-[10px]">
          <p className="m-0 text-[13px] text-txt-2 leading-[1.55]">
            {row.description}
          </p>
          {row.destructive && (
            <label className="flex items-start gap-[8px] text-[12px] text-txt-2 leading-[1.5] cursor-pointer">
              <input
                type="checkbox"
                checked={doubleConfirm}
                onChange={(e) => setDoubleConfirm(e.target.checked)}
                className="mt-[3px] accent-[var(--error)] cursor-pointer"
              />
              I understand this wipes analytics data too — runs, tokens,
              cost — and it can't be undone.
            </label>
          )}
          {lastResult && (
            <div className="text-[12px] text-txt-3 border border-line rounded-[8px] px-[10px] py-[8px] bg-bg-2 font-mono">
              Cleared {lastResult.cleared}
              {lastResult.detail && Object.keys(lastResult.detail).length > 0 && (
                <>
                  {" ·"}
                  {Object.entries(lastResult.detail).map(([k, v]) => (
                    <span key={k}> {k}={v}</span>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export function CleanupPanel() {
  const [selected, setSelected] = useState<CleanupRow | null>(null);
  const [lastResult, setLastResult] = useState<CleanupResult | null>(null);
  const cleanup = useCleanup();

  const handleConfirm = () => {
    if (!selected) return;
    cleanup.mutate(selected.kind, {
      onSuccess: (data) => {
        setLastResult(data);
        // Close after a beat so the user sees the result.
        setTimeout(() => setSelected(null), 900);
      },
    });
  };

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex flex-col gap-[6px]">
        <h2 className="m-0 text-[15px] font-semibold text-txt tracking-[-0.01em]">
          Cleanup
        </h2>
        <p className="m-0 text-[12.5px] text-txt-3 leading-[1.55]">
          Surgical resets. Every button opens a confirm dialog and reports
          exactly what it cleared. Analytics data survives all rows except
          <strong className="text-[var(--error)]"> Everything</strong>.
        </p>
      </div>
      <div className="flex flex-col gap-[8px]">
        {ROWS.map((row) => (
          <Row
            key={row.kind}
            row={row}
            onRun={() => {
              setLastResult(null);
              setSelected(row);
            }}
          />
        ))}
      </div>

      <ConfirmModal
        row={selected}
        pending={cleanup.isPending}
        lastResult={lastResult}
        onCancel={() => {
          setSelected(null);
          setLastResult(null);
        }}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
