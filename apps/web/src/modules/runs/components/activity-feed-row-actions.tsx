import { Icon } from "@/components/ui/icon";
import type { PersistedRun } from "@agent-office/domain/types";
import { useRunActions } from "../hooks/use-run-actions";

const btn =
  "flex items-center justify-center text-txt-3 w-[22px] h-[22px] rounded-[5px] hover:bg-card-3 hover:text-txt";

export function ActivityFeedRowActions({ run }: { run: PersistedRun }) {
  const { handleBranch, handleCopyPrompt } = useRunActions(run);
  return (
    <div
      className="flex shrink-0 bg-card-2 border border-edge opacity-0 gap-[2px] p-[2px] rounded-[7px] transition-opacity duration-150 group-hover:opacity-100"
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" title="Branch from here" className={btn} onClick={handleBranch}>
        <Icon name="branch" size={12} />
      </button>
      <button type="button" title="Copy prompt" className={btn} onClick={handleCopyPrompt}>
        <Icon name="copy" size={12} />
      </button>
    </div>
  );
}
