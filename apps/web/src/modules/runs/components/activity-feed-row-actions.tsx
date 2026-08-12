import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import type { PersistedRun } from "@agent-office/domain/types";
import { useRunActions } from "../hooks/use-run-actions";

const btn =
  "flex items-center justify-center text-txt-3 w-[24px] h-[24px] rounded-[5px] hover:bg-bg-2 hover:text-txt";

export function ActivityFeedRowActions({ run }: { run: PersistedRun }) {
  const { handleBranch, handleCopyPrompt } = useRunActions(run);
  return (
    <div
      className="absolute flex bg-bg-1 border border-line opacity-0 gap-[2px] p-[2px] rounded-[8px] transition-[opacity] duration-[140ms] group-hover:opacity-100"
      style={{ right: 34, top: "50%", transform: "translateY(-50%)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <Link href={PAGE_ROUTES.run(run.id)}>
        <button type="button" title="Open run" className={btn}>
          <Icon name="chevron" size={12} />
        </button>
      </Link>
      <button type="button" title="Branch from here" className={btn} onClick={handleBranch}>
        <Icon name="branch" size={12} />
      </button>
      <button type="button" title="Copy prompt" className={btn} onClick={handleCopyPrompt}>
        <Icon name="copy" size={12} />
      </button>
    </div>
  );
}
