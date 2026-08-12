"use client";

import { useEffect, useMemo, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon } from "@/components/ui/icon";
import { formatAgentDisplayName } from "@/lib/agent-display-name";
import {
  useAgentDiff,
  useApplyAgentDiff,
  type AgentDiffEntry,
  type AgentDiffResponse,
} from "../hooks/use-agent-migration";

/**
 * Agent-roster migration modal.
 *
 * Opens once per bundle-version bump. The founder reviews:
 *
 *   - "New in this version" — bundled agents they don't have yet. Default:
 *     all accepted (fresh installs).
 *   - "Changed since last install" — an agent they have that the bundle
 *     ships a newer version of. Default: skipped (a customized local file
 *     should win unless the user opts in).
 *   - "Only in your local install" — agents the bundle doesn't ship. Not
 *     actionable — surfaced so the user isn't surprised these stay put.
 *
 * On submit, the accept list gets copied over (backing up any local file
 * first), the skip list gets persisted so it doesn't re-nag, and the
 * bundle version is stamped as "processed" so subsequent launches skip
 * the modal until the bundle changes again.
 */

interface RowSelection {
  /** True → will be copied over (backup taken if a local file exists). */
  accept: boolean;
}

interface RowState {
  new: Record<string, RowSelection>;
  changed: Record<string, RowSelection>;
}

/** Seed the checkbox state from the diff. New agents default accepted;
    changed agents default skipped; entries already in the persisted skip
    list stay skipped so a re-open honors the previous decision. */
function initialRowState(diff: AgentDiffResponse): RowState {
  const skippedSet = new Set(diff.skipped);
  return {
    new: Object.fromEntries(
      diff.newAgents.map((a) => [a.id, { accept: !skippedSet.has(a.id) }]),
    ),
    changed: Object.fromEntries(
      diff.changed.map((a) => [a.id, { accept: false }]),
    ),
  };
}

interface SectionProps {
  title: string;
  subtitle: string;
  tone: "add" | "warn" | "info";
  entries: AgentDiffEntry[];
  /** Row-level accept toggle. `undefined` for read-only sections (onlyLocal). */
  selection?: Record<string, RowSelection>;
  onToggle?: (id: string) => void;
  onSelectAll?: (accept: boolean) => void;
}

const toneStyles: Record<
  SectionProps["tone"],
  { label: string; text: string; bg: string }
> = {
  add:  { label: "New",     text: "text-emerald-300", bg: "bg-emerald-500/15" },
  warn: { label: "Changed", text: "text-amber-300",   bg: "bg-amber-500/15" },
  info: { label: "Local",   text: "text-ao-fg-2",     bg: "bg-ao-line-1/25" },
};

function DiffSection({
  title,
  subtitle,
  tone,
  entries,
  selection,
  onToggle,
  onSelectAll,
}: SectionProps) {
  if (entries.length === 0) return null;
  const t = toneStyles[tone];

  const acceptedCount = selection
    ? entries.filter((e) => selection[e.id]?.accept).length
    : 0;
  const allAccepted = selection && acceptedCount === entries.length;
  const noneAccepted = selection && acceptedCount === 0;

  return (
    <section className="flex flex-col gap-[8px]">
      <header className="flex items-center gap-[10px] px-1">
        <span className="w-[3px] h-[14px] bg-ao-accent rounded-full shrink-0" />
        <h3 className="text-[13px] font-semibold text-ao-fg-0 m-0">{title}</h3>
        <span className={`inline-flex items-center rounded-[4px] px-[6px] py-[2px] text-[10.5px] font-mono tabular-nums leading-none ${t.text} ${t.bg}`}>
          {entries.length}
        </span>
        <span className="text-[11.5px] text-ao-fg-3 font-mono">{subtitle}</span>
        {selection && onSelectAll && entries.length > 1 && (
          <span className="ml-auto flex items-center gap-[4px] text-[11px] font-mono">
            <button
              type="button"
              onClick={() => onSelectAll(true)}
              disabled={allAccepted}
              className="text-ao-fg-2 hover:text-ao-fg-0 disabled:opacity-40 disabled:cursor-default cursor-pointer bg-transparent border-0 p-[3px_6px] rounded-[4px] hover:bg-ao-bg-3 transition-[background-color,color] duration-[120ms]"
            >
              accept all
            </button>
            <span className="text-ao-fg-3" aria-hidden>·</span>
            <button
              type="button"
              onClick={() => onSelectAll(false)}
              disabled={noneAccepted}
              className="text-ao-fg-2 hover:text-ao-fg-0 disabled:opacity-40 disabled:cursor-default cursor-pointer bg-transparent border-0 p-[3px_6px] rounded-[4px] hover:bg-ao-bg-3 transition-[background-color,color] duration-[120ms]"
            >
              skip all
            </button>
          </span>
        )}
      </header>

      <ul className="flex flex-col gap-[4px] list-none m-0 p-0">
        {entries.map((entry) => {
          const sel = selection?.[entry.id];
          const interactive = !!selection && !!onToggle;
          const accepted = sel?.accept ?? false;
          const displayName = formatAgentDisplayName(entry.name);
          return (
            <li key={entry.id}>
              <label
                className={[
                  "flex items-start gap-[10px] w-full text-left px-[12px] py-[9px] rounded-[8px]",
                  "border transition-[background-color,border-color] duration-[120ms]",
                  interactive
                    ? "cursor-pointer border-ao-line-1 hover:bg-ao-bg-3"
                    : "border-ao-line-1/60 bg-ao-bg-2/40",
                  accepted && "bg-ao-accent-soft border-ao-accent-line",
                ].filter(Boolean).join(" ")}
              >
                {interactive ? (
                  <input
                    type="checkbox"
                    className="mt-[3px] shrink-0 accent-ao-accent cursor-pointer"
                    checked={accepted}
                    onChange={() => onToggle!(entry.id)}
                  />
                ) : (
                  <span className="mt-[3px] shrink-0 w-[13px] h-[13px] rounded-[3px] border border-ao-line-2 bg-ao-bg-3 flex items-center justify-center text-ao-fg-3">
                    <Icon name="check" size={9} />
                  </span>
                )}
                <span className="flex-1 min-w-0 flex flex-col gap-[2px]">
                  <span className="flex items-center gap-[8px] flex-wrap">
                    <span className="text-[13px] font-semibold text-ao-fg-0">{displayName}</span>
                    <span className="font-mono text-[10.5px] text-ao-fg-3">{entry.id}</span>
                  </span>
                  {entry.description && (
                    <span className="text-[11.5px] text-ao-fg-2 leading-[1.5]">
                      {entry.description}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export interface AgentMigrationModalProps {
  open: boolean;
  onClose: () => void;
}

export function AgentMigrationModal({ open, onClose }: AgentMigrationModalProps) {
  const diffQ = useAgentDiff(open);
  const applyM = useApplyAgentDiff();

  const [rows, setRows] = useState<RowState>({ new: {}, changed: {} });

  // Sync local checkbox state whenever the diff response lands. Also reset
  // when the modal opens so a re-open after a "later" close honors any
  // persisted skip list.
  useEffect(() => {
    if (!open) return;
    if (!diffQ.data) return;
    setRows(initialRowState(diffQ.data));
  }, [open, diffQ.data]);

  const toggle = (section: "new" | "changed", id: string) => {
    setRows((prev) => ({
      ...prev,
      [section]: { ...prev[section], [id]: { accept: !prev[section][id]?.accept } },
    }));
  };
  const selectAll = (section: "new" | "changed", accept: boolean) => {
    setRows((prev) => ({
      ...prev,
      [section]: Object.fromEntries(
        Object.keys(prev[section]).map((id) => [id, { accept }]),
      ),
    }));
  };

  const acceptSlugs = useMemo(() => {
    const out: string[] = [];
    for (const [id, s] of Object.entries(rows.new))     if (s.accept) out.push(id);
    for (const [id, s] of Object.entries(rows.changed)) if (s.accept) out.push(id);
    return out;
  }, [rows]);

  const skipSlugs = useMemo(() => {
    const out: string[] = [];
    for (const [id, s] of Object.entries(rows.new))     if (!s.accept) out.push(id);
    for (const [id, s] of Object.entries(rows.changed)) if (!s.accept) out.push(id);
    return out;
  }, [rows]);

  const handleApply = async () => {
    await applyM.mutateAsync({
      accept: acceptSlugs,
      skip: skipSlugs,
      markComplete: true,
    });
    onClose();
  };

  // If the user closes without applying we treat it as "remind me next launch"
  // — do NOT stamp the version as processed. The mutation still runs so any
  // in-progress skip choices get persisted but markComplete=false leaves the
  // trigger active for next reload.
  const handleLater = async () => {
    if (skipSlugs.length > 0) {
      await applyM.mutateAsync({ accept: [], skip: skipSlugs, markComplete: false });
    }
    onClose();
  };

  const totalActionable = diffQ.data
    ? diffQ.data.newAgents.length + diffQ.data.changed.length
    : 0;

  const versionLabel = diffQ.data
    ? diffQ.data.installedVersion
      ? `${diffQ.data.installedVersion} → ${diffQ.data.bundleVersion}`
      : `first install · ${diffQ.data.bundleVersion}`
    : "…";

  return (
    <ModalShell
      open={open}
      onClose={handleLater}
      title="Agent roster update"
      size="lg"
      maxWidth={720}
      footer={
        <div className="flex items-center gap-[10px] justify-between w-full">
          <span className="text-[11.5px] font-mono text-ao-fg-3">
            {acceptSlugs.length} accepted · {skipSlugs.length} skipped
          </span>
          <div className="flex items-center gap-[8px]">
            <button
              type="button"
              onClick={handleLater}
              disabled={applyM.isPending}
              className="h-[30px] px-[12px] rounded-[8px] bg-transparent border border-ao-line-1 text-ao-fg-1 text-[13px] cursor-pointer hover:bg-ao-bg-3 hover:text-ao-fg-0 hover:border-ao-line-2 transition-[background-color,color,border-color] duration-[120ms] disabled:opacity-50 disabled:cursor-default"
            >
              Remind me later
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applyM.isPending}
              className="h-[30px] px-[14px] rounded-[8px] bg-ao-accent text-white text-[13px] font-semibold cursor-pointer hover:brightness-110 transition-[filter] duration-[120ms] disabled:opacity-50 disabled:cursor-default"
            >
              {applyM.isPending ? "Applying…" : totalActionable === 0 ? "Got it" : "Apply choices"}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-[16px]">
        <div className="flex items-start gap-[10px] text-[12.5px] text-ao-fg-1 leading-[1.55]">
          <Icon name="sparkle" size={14} className="mt-[3px] text-ao-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="m-0">
              This build ships an updated agent roster. Review below, then apply.
              Your existing agents are backed up to <code className="font-mono text-[11.5px] px-[4px] py-[1px] rounded-[3px] bg-ao-bg-3 text-ao-fg-0">~/.claude/agents/_archive/</code> before any override.
            </p>
            <p className="m-0 mt-[4px] text-ao-fg-3 font-mono text-[11px]">
              bundle version · {versionLabel}
            </p>
          </div>
        </div>

        {diffQ.isLoading && (
          <div className="text-[12.5px] text-ao-fg-3 font-mono flex items-center gap-2 py-4">
            <Icon name="refresh" size={12} className="[animation:spin_1s_linear_infinite]" />
            Loading roster diff…
          </div>
        )}
        {diffQ.isError && (
          <div className="text-[12.5px] text-red-300 font-mono py-3">
            Failed to load the roster diff. Close and reopen the app to retry.
          </div>
        )}

        {diffQ.data && (
          <>
            <DiffSection
              title="New in this version"
              subtitle="not yet installed"
              tone="add"
              entries={diffQ.data.newAgents}
              selection={rows.new}
              onToggle={(id) => toggle("new", id)}
              onSelectAll={(accept) => selectAll("new", accept)}
            />
            <DiffSection
              title="Changed since last install"
              subtitle="your local copy differs from the bundle"
              tone="warn"
              entries={diffQ.data.changed}
              selection={rows.changed}
              onToggle={(id) => toggle("changed", id)}
              onSelectAll={(accept) => selectAll("changed", accept)}
            />
            <DiffSection
              title="Only in your local install"
              subtitle="untouched — your customs stay"
              tone="info"
              entries={diffQ.data.onlyLocal}
            />

            {totalActionable === 0 && (
              <p className="text-[12.5px] text-ao-fg-2 font-mono m-0 py-2">
                Nothing to migrate. Roster already matches the bundle.
              </p>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}
