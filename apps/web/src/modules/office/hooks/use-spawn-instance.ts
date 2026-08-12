"use client";

import { useCallback } from "react";
import { useAddInstance } from "@/modules/projects/hooks/use-projects";
import { useOfficeStore } from "./use-office-store";
import { useAgentCapStore } from "./use-agent-cap-store";
import type { AgentInstance } from "@agent-office/domain/types";

export function useSpawnInstance(params: {
  activeProjectId: string | null;
}): {
  spawnInstance: (agentId: string) => Promise<void>;
} {
  const { activeProjectId } = params;
  const addMut = useAddInstance();
  const setGroupExpanded = useOfficeStore((s) => s.setGroupExpanded);
  const showSoftCap = useAgentCapStore((s) => s.showSoft);
  const showHardCap = useAgentCapStore((s) => s.showHard);
  const closeCap = useAgentCapStore((s) => s.close);

  const spawnOnce = useCallback((agentId: string, force: boolean): Promise<{ instance: AgentInstance }> => {
    if (!activeProjectId) return Promise.reject(new Error("no active project"));
    return new Promise((resolve, reject) => {
      addMut.mutate(
        { projectId: activeProjectId, agentId, ...(force ? { force: true } : {}) },
        { onSuccess: (data) => resolve(data), onError: reject },
      );
    });
  }, [activeProjectId, addMut]);

  const spawnInstance = useCallback(async (agentId: string) => {
    if (!activeProjectId) return;
    try {
      await spawnOnce(agentId, false);
      setGroupExpanded(activeProjectId, agentId, true);
    } catch (err: unknown) {
      const anyErr = err as { status?: number; data?: { softCap?: boolean } };
      if (anyErr?.status !== 409) return;
      if (anyErr?.data?.softCap) {
        // Soft cap: raise the app-level modal, let the user opt in.
        showSoftCap(
          () => {
            closeCap();
            void spawnOnce(agentId, true)
              .then(() => setGroupExpanded(activeProjectId, agentId, true))
              .catch(() => { /* backend hard-stopped */ });
          },
          () => closeCap(),
        );
        return;
      }
      // Hard cap: 10-instance ceiling, no override.
      showHardCap(() => closeCap());
    }
  }, [activeProjectId, spawnOnce, setGroupExpanded, showSoftCap, showHardCap, closeCap]);

  return { spawnInstance };
}
