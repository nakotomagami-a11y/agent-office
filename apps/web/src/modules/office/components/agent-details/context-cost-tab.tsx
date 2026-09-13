"use client";

import { useContextCost, useMeasureContextCost } from "@/modules/agents/hooks/use-agents";
import { Icon } from "@/components/ui/icon";
import { fmtTok } from "@/modules/summon/format/message-format";
import { toast } from "@/lib/toast-store";
import type { ContextCostRow } from "@agent-office/domain/types";

/**
 * Fixed cycling palette for the segmented bar / row swatches. Not a semantic
 * mapping (there's no fixed "skills are purple" rule) — rows are sorted by
 * cost, so this just needs enough distinct, on-brand hues to tell adjacent
 * rows apart at a glance.
 */
const PALETTE = ["#8b7bff", "#6d8dff", "#38bdf8", "#2dd4bf", "#b58cff", "#e6b35a", "#6f7590", "#4eb96f", "#d9534f", "#a3a8bd"];

function usd(n: number, decimals = 3): string {
  return `$${n.toFixed(decimals)}`;
}

function SegmentedBar({ rows, total }: { rows: ColoredRow[]; total: number }) {
  return (
    <div className="flex gap-[2px] h-[46px] rounded-[10px] overflow-hidden bg-ao-bg-3">
      {rows.map((r, i) => {
        const pct = total > 0 ? (r.tokensEst / total) * 100 : 0;
        if (pct <= 0) return null;
        const showLabel = pct > 7;
        return (
          <div
            key={r.key}
            title={`${r.name} — ~${fmtTok(r.tokensEst)} tok`}
            className="relative flex flex-col justify-center px-[9px] overflow-hidden shrink-0"
            style={{ width: `${pct.toFixed(2)}%`, minWidth: "3px", background: PALETTE[i % PALETTE.length] }}
          >
            {showLabel && (
              <>
                <span className="text-[9.5px] font-extrabold text-black/80 whitespace-nowrap overflow-hidden text-ellipsis">{r.name}</span>
                <span className="font-mono text-[8.5px] text-black/60 whitespace-nowrap">~{fmtTok(r.tokensEst)}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-[13px] py-[2px] border-l border-ao-line-0 first:border-l-0 first:pl-0">
      <div className="text-[8.5px] font-bold tracking-[0.08em] uppercase text-ao-fg-3 whitespace-nowrap">{label}</div>
      <div className="mt-[3px] font-mono text-[12px] text-ao-fg-1 whitespace-nowrap">{value}</div>
    </div>
  );
}

type ColoredRow = ContextCostRow & { color: string };

function Row({ row, maxTokens }: { row: ColoredRow; maxTokens: number }) {
  const barPct = maxTokens > 0 ? (row.tokensEst / maxTokens) * 100 : 0;
  return (
    <div className="flex items-center gap-[11px] py-[8px] px-[9px] rounded-[10px] hover:bg-ao-bg-3 transition-colors duration-[120ms]">
      <span className="w-[3px] h-[22px] rounded-[2px] shrink-0" style={{ background: row.color }} />
      <div className="w-[190px] shrink-0 min-w-0">
        <div className="flex items-center gap-[6px] text-[12px] font-semibold text-ao-fg-0 truncate">
          {row.name}
        </div>
        <div className="font-mono text-[9px] text-ao-fg-3 truncate">{row.sub}</div>
      </div>
      <div className="flex-1 min-w-0 h-[6px] rounded-full bg-ao-bg-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-[200ms]"
          style={{ width: `${barPct}%`, background: row.color }}
        />
      </div>
      <span className="w-[54px] text-right font-mono text-[10.5px] text-ao-fg-2 shrink-0">~{fmtTok(row.tokensEst)}</span>
      {row.locked ? (
        <span title="Not yours to trim — owned by Claude Code, not agent-office" className="w-[20px] flex justify-center text-ao-fg-3 shrink-0">
          <Icon name="lock" size={12} />
        </span>
      ) : (
        <span className="w-[20px] shrink-0" aria-hidden />
      )}
    </div>
  );
}

export function ContextCostTab({
  agentId,
  instanceId,
  projectId,
}: {
  agentId: string;
  instanceId: string | undefined;
  projectId: string | undefined;
}) {
  const q = useContextCost(agentId, instanceId, projectId);
  const measure = useMeasureContextCost();
  const data = q.data;

  if (q.isLoading) {
    return <div className="flex-1 flex items-center justify-center text-ao-fg-3 text-[13px]">Loading…</div>;
  }
  if (!data) {
    return <div className="flex-1 flex items-center justify-center text-ao-fg-3 text-[13px]">Couldn&apos;t load context breakdown.</div>;
  }

  // "always" rows are the resident system prompt (the headline total + bar).
  // "first-turn" rows (prior-history injection) are paid once per new thread,
  // in the user message — shown as a distinct addendum, never in the bar/total.
  const alwaysRows = data.rows.filter((r) => (r.phase ?? "always") === "always");
  const firstTurnRows = data.rows.filter((r) => r.phase === "first-turn");
  const rowsWithColor = alwaysRows.map((r, i) => ({ ...r, color: PALETTE[i % PALETTE.length]! }));
  const maxTokens = Math.max(1, ...alwaysRows.map((r) => r.tokensEst));
  const biggest = alwaysRows[0];
  const lockedTokens = alwaysRows.filter((r) => r.locked).reduce((a, r) => a + r.tokensEst, 0);
  const cacheWriteCost = data.totalTokensEst * data.writeRatePerTokUsd;
  const cacheReadCostPerTurn = data.totalTokensEst * data.readRatePerTokUsd;
  const hasExactMeasurement = data.rows.some((r) => r.key === "native-cc");

  const handleMeasure = () => {
    measure.mutate(
      { agentId, instanceId, projectId },
      {
        onSuccess: () => toast("Measured — native overhead split for real"),
        onError: (err) => toast(err instanceof Error ? err.message : "Measurement failed"),
      },
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-ao-fg-2">
            <span className="font-mono text-ao-fg-3">
              {data.model} · {data.runsPerWeek} runs/wk · {data.avgTurnsPerSession.toFixed(1)} turns avg
            </span>
          </div>
          <div className="mt-1 text-[12px] text-ao-fg-2 max-w-[640px] leading-[1.5]">
            Everything this session pays for before you type a word — estimated locally (~4 chars/token), amortized over this
            agent&apos;s own average turns per session.
          </div>
        </div>
        <button
          type="button"
          onClick={handleMeasure}
          disabled={measure.isPending}
          title="Spawns a real, throwaway probe session (~10-15s, a little real spend) to split native overhead into CC base+tools vs. MCP for real, instead of estimating"
          className="shrink-0 inline-flex items-center gap-[6px] h-[30px] px-[12px] rounded-[9px] text-[11.5px] font-semibold whitespace-nowrap bg-ao-bg-3 border border-ao-line-1 text-ao-fg-1 hover:border-ao-line-2 hover:text-ao-fg-0 transition-colors duration-[120ms] disabled:opacity-50 disabled:cursor-default"
        >
          <Icon name={measure.isPending ? "refresh" : "zap"} size={12} className={measure.isPending ? "animate-spin" : undefined} />
          {measure.isPending ? "Measuring… (~10-15s)" : hasExactMeasurement ? "Re-measure exactly" : "Measure exactly"}
        </button>
      </div>

      {/* ── Summary card ── */}
      <div className="rounded-[16px] bg-ao-bg-2 border border-ao-line-0 px-[18px] py-[16px] mb-[14px]">
        <div className="flex items-end gap-[22px] mb-[14px] flex-wrap">
          <div>
            <div className="text-[9px] font-bold tracking-[0.09em] uppercase text-ao-fg-3 mb-[5px]">System prompt, per run</div>
            <div className="flex items-baseline gap-[9px]">
              <span className="font-mono text-[26px] font-medium text-ao-fg-0">{usd(data.costPerRunEst, 3)}</span>
              <span className="font-mono text-[12px] text-ao-fg-3">~{fmtTok(data.totalTokensEst)} tok</span>
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex">
            <Fact label="Per week" value={usd(data.costPerWeekEst, 2)} />
            <Fact label="Yours to trim" value={`${Math.round(100 - (lockedTokens / Math.max(1, data.totalTokensEst)) * 100)}%`} />
            <Fact label="Biggest part" value={biggest ? biggest.name.toLowerCase() : "—"} />
          </div>
        </div>

        <SegmentedBar rows={rowsWithColor} total={data.totalTokensEst} />

        <div className="mt-[9px] flex items-center gap-2 flex-wrap">
          <span className="text-[10.5px] text-ao-fg-3">
            {data.windowPct.toFixed(1)}% of the {fmtTok(data.contextWindowTokens)} context window is spent before the first message
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[9.5px] text-ao-fg-3">
            cache write {usd(cacheWriteCost, 3)} · cache read {usd(cacheReadCostPerTurn, 4)} × {Math.max(1, Math.round(data.avgTurnsPerSession))} turns
          </span>
        </div>
        {data.firstTurnTokensEst > 0 && (
          <div className="mt-[8px] pt-[8px] border-t border-ao-line-0 text-[10.5px] text-ao-fg-3">
            + ~{fmtTok(data.firstTurnTokensEst)} tok on the <span className="text-ao-fg-2">first message of a new thread only</span> (prior-history injection) — not counted above, since resumed turns don&apos;t pay it.
          </div>
        )}
      </div>

      {/* ── Row list ── */}
      <div className="rounded-[16px] bg-ao-bg-2 border border-ao-line-0 px-[14px] pt-[12px] pb-[10px]">
        <div className="flex items-center gap-2 mb-[8px]">
          <span className="text-[12.5px] font-bold text-ao-fg-0">Where it goes</span>
          <span className="font-mono text-[9.5px] text-ao-fg-3">sorted by cost</span>
          <span className="flex-1" />
          <span className="text-[8.5px] font-bold tracking-[0.08em] uppercase text-ao-fg-3">tokens</span>
        </div>
        <div className="flex flex-col gap-[2px]">
          {rowsWithColor.map((row) => (
            <Row key={row.key} row={row} maxTokens={maxTokens} />
          ))}
        </div>
        {firstTurnRows.length > 0 && (
          <>
            <div className="mt-[10px] mb-[4px] px-[9px] text-[8.5px] font-bold tracking-[0.08em] uppercase text-ao-fg-3">
              First message of a new thread only
            </div>
            <div className="flex flex-col gap-[2px] opacity-[0.72]">
              {firstTurnRows.map((row, i) => (
                <Row key={row.key} row={{ ...row, color: PALETTE[(alwaysRows.length + i) % PALETTE.length]! }} maxTokens={maxTokens} />
              ))}
            </div>
          </>
        )}
      </div>

      {data.conditionalFiles.length > 0 && (
        <div className="mt-[14px] rounded-[16px] bg-ao-bg-2 border border-ao-line-0 px-[14px] pt-[12px] pb-[10px]">
          <div className="flex items-center gap-2 mb-[6px]">
            <span className="text-[12.5px] font-bold text-ao-fg-0">Elsewhere in this project</span>
            <span className="font-mono text-[9.5px] text-ao-fg-3">not counted above</span>
          </div>
          <div className="mb-[8px] text-[10.5px] text-ao-fg-3 leading-[1.5] max-w-[640px]">
            CLAUDE.md/AGENTS.md files outside this instance&apos;s own working directory — Claude Code only loads one of these
            if the agent&apos;s task actually reads or edits a file underneath it (e.g. a Next.js app&apos;s own AGENTS.md).
            Not a fixed cost, so it&apos;s excluded from the total above.
          </div>
          <div className="flex flex-col gap-[2px]">
            {data.conditionalFiles.map((f) => (
              <div key={f.path} className="flex items-center gap-[11px] py-[6px] px-[9px]">
                <div className="flex-1 min-w-0">
                  <div className="text-[11.5px] font-semibold text-ao-fg-1 truncate">{f.path.split("/").pop()}</div>
                  <div className="font-mono text-[9px] text-ao-fg-3 truncate">{f.path} · {f.lines} lines</div>
                </div>
                <span className="font-mono text-[10.5px] text-ao-fg-3 shrink-0">~{fmtTok(f.tokens)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
