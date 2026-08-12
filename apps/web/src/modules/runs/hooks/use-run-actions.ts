import type { PersistedRun } from "@agent-office/domain/types";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { useBranchStore } from "@/lib/branch-store";

export function useRunActions(run: PersistedRun) {
  const selectAgent = useOfficeStore((s) => s.select);
  const setBranchSeed = useBranchStore((s) => s.setSeed);

  const handleBranch = () => {
    setBranchSeed({ agentId: run.agentId, instanceId: run.instanceId ?? null, prompt: run.prompt });
    selectAgent(run.agentId, { tab: "conversation", instanceId: run.instanceId ?? null });
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(run.prompt);
  };

  return { handleBranch, handleCopyPrompt };
}
