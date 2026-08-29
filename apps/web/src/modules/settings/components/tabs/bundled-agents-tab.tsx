"use client";

/**
 * Bundled agents tab — a review surface over `/api/starter/agent-diff`.
 *
 * The old version reduced the diff to three big count boxes ("2", "4", "0"),
 * throwing away the one thing the user actually wants to see: *which* agents
 * changed. This version leads with a preview list of the actionable agents
 * (name + description + New/Updated tag), a compact version trail, and a real
 * up-to-date state. The heavy lifting (accept/skip, backup to _archive/) still
 * lives in `AgentMigrationModal`; this tab reviews and launches it.
 */

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import { AgentMigrationModal } from "@/modules/agents/components/agent-migration-modal";
import {
  useAgentDiff,
  type AgentDiffEntry,
} from "@/modules/agents/hooks/use-agent-migration";

export function BundledAgentsTab() {
  const qc = useQueryClient();
  const diffQ = useAgentDiff(true);
  const [modalOpen, setModalOpen] = useState(false);

  if (diffQ.isLoading) return null;

  if (diffQ.isError || !diffQ.data) {
    return (
      <Card>
        <CardHeader
          title="Bundled agents"
          sub="couldn't reach the manifest — the starter bundle may be missing from this build"
        />
      </Card>
    );
  }

  const { bundleVersion, installedVersion, newAgents, changed, onlyLocal } = diffQ.data;
  const actionable = newAgents.length + changed.length;
  const upToDate = actionable === 0 && installedVersion === bundleVersion;

  return (
    <>
      <Card>
        <CardHeader
          title="Bundled agents"
          sub="the default roster Agent Office ships with"
          right={<StatusChip upToDate={upToDate} count={actionable} />}
        />

        <div className="p-4 flex flex-col gap-[16px]">
          <VersionTrail installed={installedVersion} bundle={bundleVersion} />

          {actionable === 0 ? (
            <UpToDateState localCount={onlyLocal.length} />
          ) : (
            <div className="flex flex-col gap-[7px]">
              {newAgents.map((a) => (
                <AgentRow key={a.id} agent={a} kind="new" />
              ))}
              {changed.map((a) => (
                <AgentRow key={a.id} agent={a} kind="updated" />
              ))}
            </div>
          )}

          {actionable > 0 && onlyLocal.length > 0 ? (
            <LocalOnlyNote agents={onlyLocal} />
          ) : null}

          <div className="flex items-center gap-[8px] justify-end">
            <Button
              variant="ghost"
              onClick={() =>
                qc.invalidateQueries({ queryKey: queryKeys.agents.migrationDiff() })
              }
            >
              <Icon name="refresh" size={13} className="mr-[6px]" />
              Re-check
            </Button>
            <Button variant="primary" disabled={actionable === 0} onClick={() => setModalOpen(true)}>
              {actionable === 0
                ? "Up to date"
                : `Review ${actionable} change${actionable === 1 ? "" : "s"}`}
            </Button>
          </div>

          <FootnoteDisclosure />
        </div>
      </Card>

      <AgentMigrationModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

// ─── Presentational bits ────────────────────────────────────────────────

function StatusChip({ upToDate, count }: { upToDate: boolean; count: number }) {
  const base =
    "inline-flex items-center gap-[5px] h-[22px] px-[9px] rounded-full text-[11px] font-[var(--font-mono)] font-semibold";
  if (upToDate) {
    return (
      <span className={cn(base, "bg-ao-ok-soft text-ao-ok")}>
        <Icon name="check" size={12} /> Up to date
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-ao-accent-soft text-ao-accent")}>
      <Icon name="sparkle" size={12} /> {count} update{count === 1 ? "" : "s"}
    </span>
  );
}

function VersionTrail({
  installed,
  bundle,
}: {
  installed: string | null;
  bundle: string | null;
}) {
  return (
    <div className="flex items-center gap-[8px] font-[var(--font-mono)] text-[11.5px] text-txt-3">
      <span className="uppercase tracking-[0.06em] text-[10px] text-txt-4">installed</span>
      <span className={installed ? "text-txt-2" : "text-txt-4 italic"}>{installed ?? "never"}</span>
      <span className="text-txt-4">→</span>
      <span className="uppercase tracking-[0.06em] text-[10px] text-txt-4">bundle</span>
      <span className={bundle ? "text-txt-2" : "text-txt-4 italic"}>{bundle ?? "—"}</span>
    </div>
  );
}

function AgentRow({ agent, kind }: { agent: AgentDiffEntry; kind: "new" | "updated" }) {
  const isNew = kind === "new";
  const tone = isNew ? "bg-ao-accent-soft text-ao-accent" : "bg-ao-warn-soft text-ao-warn";
  return (
    <div className="flex items-center gap-[12px] px-[12px] py-[10px] rounded-[10px] border border-line bg-bg-2">
      <span className={cn("flex items-center justify-center w-[30px] h-[30px] rounded-[8px] shrink-0", tone)}>
        <Icon name={isNew ? "sparkle" : "refresh"} size={15} />
      </span>
      <div className="flex flex-col min-w-0 flex-1 gap-[1px]">
        <span className="text-[13px] font-semibold text-txt truncate">{agent.name}</span>
        {agent.description ? (
          <span className="text-[11.5px] text-txt-3 truncate">{agent.description}</span>
        ) : null}
      </div>
      <span
        className={cn(
          "shrink-0 inline-flex items-center h-[20px] px-[8px] rounded-full text-[10px] font-[var(--font-mono)] font-semibold uppercase tracking-[0.05em]",
          tone,
        )}
      >
        {isNew ? "New" : "Updated"}
      </span>
    </div>
  );
}

function LocalOnlyNote({ agents }: { agents: AgentDiffEntry[] }) {
  const n = agents.length;
  return (
    <details className="group border-t border-line pt-[12px]">
      <summary className="flex items-center gap-[7px] cursor-pointer select-none list-none text-[11.5px] text-txt-3 hover:text-txt-2">
        <Icon name="identity" size={13} className="text-txt-4" />
        <span>
          <b className="font-semibold text-txt-2">{n}</b> local-only agent{n === 1 ? "" : "s"} left untouched
        </span>
        <Icon
          name="chevron-down"
          size={12}
          className="ml-[2px] text-txt-4 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="flex flex-wrap gap-[6px] mt-[10px] pl-[20px]">
        {agents.map((a) => (
          <Tag key={a.id}>{a.name}</Tag>
        ))}
      </div>
    </details>
  );
}

function UpToDateState({ localCount }: { localCount: number }) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-[8px] py-[20px]">
      <span className="flex items-center justify-center w-[40px] h-[40px] rounded-full bg-ao-ok-soft text-ao-ok">
        <Icon name="check" size={20} />
      </span>
      <div className="text-[13px] font-semibold text-txt">You&rsquo;re on the latest bundle</div>
      <div className="text-[11.5px] text-txt-3">
        {localCount > 0
          ? `${localCount} local-only agent${localCount === 1 ? "" : "s"} left untouched`
          : "Nothing to review"}
      </div>
    </div>
  );
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="font-[var(--font-mono)] text-[11px] text-txt-2 bg-bg-2 border border-line rounded-[4px] px-[4px] py-[1px]">
      {children}
    </code>
  );
}

function FootnoteDisclosure() {
  return (
    <details className="border-t border-line pt-[12px]">
      <summary className="w-fit cursor-pointer select-none list-none text-[11.5px] text-txt-3 hover:text-txt-2 flex items-center gap-[6px] group">
        <Icon
          name="chevron-down"
          size={12}
          className="text-txt-4 transition-transform group-open:rotate-180"
        />
        How bundled agents work
      </summary>
      <p className="mt-[10px] text-[11.5px] text-txt-3 leading-[1.6]">
        The bundle lives in <InlineCode>apps/web/starter-data/agents/</InlineCode>. An agent&rsquo;s
        identity — foundational knowledge that&rsquo;s part of who it is — can travel alongside as{" "}
        <InlineCode>&lt;name&gt;.identity.md</InlineCode>. Per-installation session memory (
        <InlineCode>.memory.md</InlineCode>) is never shipped, and your customizations are backed up
        to <InlineCode>_archive/</InlineCode> before any override.
      </p>
    </details>
  );
}
