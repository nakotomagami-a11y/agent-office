import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import type { PersistedRun } from "@agent-office/domain/types";
import { buildRunMetaFields } from "../derive/run-meta-fields";
import { useRunActions } from "../hooks/use-run-actions";

export function ActivityFeedRowDetail({ run }: { run: PersistedRun }) {
  const { handleBranch, handleCopyPrompt } = useRunActions(run);
  const fields = buildRunMetaFields(run);

  return (
    <div className="act-detail grid bg-bg-2 m-0 mb-[5px] border-t-0 rounded-b-[10px] px-[16px] py-[14px] gap-[12px]" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="bg-bg-1 border border-line overflow-hidden rounded-[8px]">
        <div className="flex items-center text-txt-3 uppercase border-b border-line px-[12px] py-[7px] font-[var(--font-mono)] text-[10px] tracking-[0.08em] gap-[8px]">
          <Icon name="chevron" size={10} /> prompt
        </div>
        <div className="text-txt overflow-y-auto break-words px-[12px] py-[10px] font-[var(--font-mono)] text-[11.5px] leading-[1.55] max-h-[150px] whitespace-pre-wrap">{run.prompt}</div>
      </div>
      <div className="bg-bg-1 border border-line overflow-hidden rounded-[8px]">
        <div className="flex items-center text-txt-3 uppercase border-b border-line px-[12px] py-[7px] font-[var(--font-mono)] text-[10px] tracking-[0.08em] gap-[8px]">
          <Icon name="activity" size={10} /> response
        </div>
        <div className="text-txt overflow-y-auto break-words px-[12px] py-[10px] font-[var(--font-mono)] text-[11.5px] leading-[1.55] max-h-[150px] whitespace-pre-wrap">
          {run.output || "(no output recorded)"}
        </div>
      </div>
      <div className="flex flex-wrap gap-[18px] pt-[8px] border-t border-dashed border-line" style={{ gridColumn: "1 / -1" }}>
        {fields.map(({ l, v }) => (
          <div key={l} className="flex flex-col font-[var(--font-mono)]">
            <div className="text-txt-4 uppercase text-[9.5px] tracking-[0.08em]">{l}</div>
            <div className="text-txt text-[11.5px] mt-[2px]">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-[8px] pt-[10px] border-t border-dashed border-line" style={{ gridColumn: "1 / -1" }}>
        <Button href={PAGE_ROUTES.run(run.id)} size="sm">
          <Icon name="chevron" size={12} />
          Open in chat
        </Button>
        <Button size="sm" variant="ghost" onClick={handleBranch}>
          <Icon name="branch" size={12} />
          Branch from here
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCopyPrompt}>
          <Icon name="copy" size={12} />
          Copy prompt
        </Button>
      </div>
    </div>
  );
}
