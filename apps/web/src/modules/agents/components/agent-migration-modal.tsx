"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon } from "@/components/ui/icon";
import { useAgentDiff, useApplyAgentDiff, type AgentDiffResponse } from "../hooks/use-agent-migration";
import { DiffSection, type RowSelection } from "./agent-migration-section";

/**
 * Agent-roster migration modal.
 *
 * Opens once per bundle-version bump. The founder reviews:
 *
 *   - "New in this version" — bundled agents they don't have yet. Default:
 *     accepted, unless skipped for this version or declined before.
 *   - "Changed since last install" — your copy and the bundle's differ.
 *     Default: accepted only when the local copy is untouched since it
 *     was installed; a local edit is never overwritten unless the user
 *     checks it.
 *   - "Edited locally" — only the local copy changed. Never pre-checked;
 *     checking one resets it to the bundle copy.
 *   - "Only in your local install" — agents the bundle doesn't ship. Not
 *     actionable — surfaced so the user isn't surprised these stay put.
 *
 * On submit, the accept list gets copied over (backing up any local file
 * first), the skip list gets persisted so it doesn't re-nag, and the
 * bundle version is stamped as "processed" so subsequent launches skip
 * the modal until the bundle changes again.
 */

type Section = "new" | "changed" | "edited";
type RowState = Record<Section, Record<string, RowSelection>>;

function initialRowState(diff: AgentDiffResponse): RowState {
  const skippedSet = new Set(diff.skipped);
  return {
    new: Object.fromEntries(
      diff.newAgents.map((a) => [a.id, { accept: !skippedSet.has(a.id) && !a.declined }]),
    ),
    changed: Object.fromEntries(
      diff.changed.map((a) => [a.id, { accept: a.change === "bundle_changed" && !skippedSet.has(a.id) }]),
    ),
    edited: Object.fromEntries(diff.editedLocally.map((a) => [a.id, { accept: false }])),
  };
}

export interface AgentMigrationModalProps {
  open: boolean;
  onClose: () => void;
}

export function AgentMigrationModal({ open, onClose }: AgentMigrationModalProps) {
  const t = useTranslations("agent_migration");
  const diffQ = useAgentDiff(open);
  const applyM = useApplyAgentDiff();

  const [rows, setRows] = useState<RowState>({ new: {}, changed: {}, edited: {} });
  const [applyError, setApplyError] = useState<string | null>(null);
  const [laterFailed, setLaterFailed] = useState(false);

  // Sync local checkbox state whenever the diff response lands. Also reset
  // when the modal opens so a re-open after a "later" close honors any
  // persisted skip list.
  useEffect(() => {
    if (!open) return;
    if (!diffQ.data) return;
    setRows(initialRowState(diffQ.data));
    setApplyError(null);
    setLaterFailed(false);
  }, [open, diffQ.data]);

  const toggle = (section: Section, id: string) => {
    setRows((prev) => ({
      ...prev,
      [section]: { ...prev[section], [id]: { accept: !prev[section][id]?.accept } },
    }));
  };
  const selectAll = (section: Section, accept: boolean) => {
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
    for (const [id, s] of Object.entries(rows.edited))  if (s.accept) out.push(id);
    return out;
  }, [rows]);

  const skipSlugs = useMemo(() => {
    const out: string[] = [];
    for (const [id, s] of Object.entries(rows.new))     if (!s.accept) out.push(id);
    for (const [id, s] of Object.entries(rows.changed)) if (!s.accept) out.push(id);
    return out;
  }, [rows]);

  const bundleOlder = !!diffQ.data?.bundleOlder;

  const handleApply = async () => {
    setApplyError(null);
    try {
      const result = await applyM.mutateAsync({
        accept: acceptSlugs,
        skip: skipSlugs,
        markComplete: true,
      });
      if (result.errors.length > 0) {
        setApplyError(t("apply_failed", { errors: result.errors.map((e) => `${e.id}: ${e.reason}`).join(" · ") }));
        return;
      }
      onClose();
    } catch (err) {
      setApplyError(t("apply_failed", { errors: err instanceof Error ? err.message : String(err) }));
    }
  };

  // Closing without applying = "remind me next launch": the version is NOT
  // stamped, but the unchecked rows are recorded as skipped for this version,
  // so next launch only re-opens for agents the user still wanted.
  const handleLater = async () => {
    if (!bundleOlder && diffQ.data && !laterFailed) {
      setApplyError(null);
      try {
        await applyM.mutateAsync({ accept: [], skip: skipSlugs, markComplete: false });
      } catch (err) {
        // Held open once so the failure is seen; the next close always closes, or a dead server traps the user.
        setLaterFailed(true);
        setApplyError(t("later_failed", { error: err instanceof Error ? err.message : String(err) }));
        return;
      }
    }
    onClose();
  };

  const totalActionable = diffQ.data
    ? diffQ.data.newAgents.length + diffQ.data.changed.length + diffQ.data.editedLocally.length
    : 0;

  const versionLabel = diffQ.data
    ? diffQ.data.installedVersion
      ? `${diffQ.data.installedVersion} → ${diffQ.data.bundleVersion}`
      : t("first_install", { version: diffQ.data.bundleVersion ?? "" })
    : "…";

  return (
    <ModalShell
      open={open}
      onClose={handleLater}
      title={t("title")}
      size="lg"
      maxWidth={720}
      footer={
        <div className="flex items-center gap-[10px] justify-between w-full">
          <span className="text-[11.5px] font-mono text-ao-fg-3">
            {t("footer_counts", { accepted: acceptSlugs.length, skipped: skipSlugs.length })}
          </span>
          <div className="flex items-center gap-[8px]">
            <button
              type="button"
              onClick={handleLater}
              disabled={applyM.isPending}
              className="h-[30px] px-[12px] rounded-[8px] bg-transparent border border-ao-line-1 text-ao-fg-1 text-[13px] cursor-pointer hover:bg-ao-bg-3 hover:text-ao-fg-0 hover:border-ao-line-2 transition-[background-color,color,border-color] duration-[120ms] disabled:opacity-50 disabled:cursor-default"
            >
              {t("remind_later")}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applyM.isPending || bundleOlder}
              className="h-[30px] px-[14px] rounded-[8px] bg-ao-accent text-white text-[13px] font-semibold cursor-pointer hover:brightness-110 transition-[filter] duration-[120ms] disabled:opacity-50 disabled:cursor-default"
            >
              {applyM.isPending ? t("applying") : bundleOlder ? t("nothing_to_apply") : totalActionable === 0 ? t("got_it") : t("apply")}
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
              {t.rich("intro", {
                code: (chunks) => <code className="font-mono text-[11.5px] px-[4px] py-[1px] rounded-[3px] bg-ao-bg-3 text-ao-fg-0">{chunks}</code>,
              })}
            </p>
            <p className="m-0 mt-[4px] text-ao-fg-3 font-mono text-[11px]">
              {t("version_label", { label: versionLabel })}
            </p>
          </div>
        </div>

        {diffQ.isLoading && (
          <div className="text-[12.5px] text-ao-fg-3 font-mono flex items-center gap-2 py-4">
            <Icon name="refresh" size={12} className="[animation:spin_1s_linear_infinite]" />
            {t("loading")}
          </div>
        )}
        {diffQ.isError && (
          <div className="text-[12.5px] text-red-300 font-mono py-3">
            {t("load_failed")}
          </div>
        )}

        {applyError && (
          <div role="alert" className="text-[12.5px] text-red-300 font-mono py-1">
            {applyError}
          </div>
        )}

        {bundleOlder && diffQ.data && (
          <p className="text-[12.5px] text-ao-fg-2 m-0">
            {t("bundle_older", { bundle: diffQ.data.bundleVersion ?? "", installed: diffQ.data.installedVersion ?? "" })}
          </p>
        )}

        {diffQ.data && (
          <>
            <DiffSection
              title={t("section_new_title")}
              subtitle={t("section_new_sub")}
              tone="add"
              entries={diffQ.data.newAgents}
              selection={rows.new}
              onToggle={(id) => toggle("new", id)}
              onSelectAll={(accept) => selectAll("new", accept)}
            />
            <DiffSection
              title={t("section_changed_title")}
              subtitle={t("section_changed_sub")}
              tone="warn"
              entries={diffQ.data.changed}
              selection={rows.changed}
              onToggle={(id) => toggle("changed", id)}
              onSelectAll={(accept) => selectAll("changed", accept)}
            />
            <DiffSection
              title={t("section_edited_title")}
              subtitle={t("section_edited_sub")}
              tone="warn"
              entries={diffQ.data.editedLocally}
              selection={rows.edited}
              onToggle={(id) => toggle("edited", id)}
              onSelectAll={(accept) => selectAll("edited", accept)}
            />
            <DiffSection
              title={t("section_local_title")}
              subtitle={t("section_local_sub")}
              tone="info"
              entries={diffQ.data.onlyLocal}
            />

            {totalActionable === 0 && !bundleOlder && (
              <p className="text-[12.5px] text-ao-fg-2 font-mono m-0 py-2">
                {t("nothing_to_migrate")}
              </p>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}
