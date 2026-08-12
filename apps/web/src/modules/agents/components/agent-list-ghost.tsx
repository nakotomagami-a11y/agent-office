"use client";

import { Skeleton } from "@/components/ui/skeleton";

export type AgentListGhostProps = {
  count?: number;
};

/**
 * Ghost layout for AgentList loading state.
 * Mirrors the loaded card shape: 40×40 avatar + name/category block + edit
 * button placeholder, description block, skills row, footer row.
 */
export function AgentListGhost({ count = 4 }: AgentListGhostProps) {
  return (
    <div
      className="p-[18px] overflow-auto flex flex-col gap-3.5"
      aria-busy="true"
      aria-label="Loading agents"
      role="status"
    >
      {/* Search bar ghost */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex-[1_1_320px] max-w-[480px]">
            <Skeleton width="100%" height={32} rounded={8} />
          </div>
        </div>
      </div>

      {/* Card grid ghost */}
      <div
        className="flex flex-col gap-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
        aria-hidden="true"
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="bg-bg-1 border border-line rounded-[var(--r-lg)] shadow-1 !p-4 !flex !flex-col !gap-2.5 pointer-events-none"
          >
            {/* Header: avatar + name/category + edit button placeholder */}
            <div className="flex items-center gap-2.5">
              <Skeleton width={40} height={40} rounded={8} />
              <div className="flex-1 min-w-0 flex flex-col gap-[5px]">
                <Skeleton width={130} height={14} />
                <Skeleton width={80} height={11} />
              </div>
              <Skeleton width={24} height={24} rounded={6} />
            </div>

            {/* Description: two lines */}
            <div className="flex flex-col gap-[5px]">
              <Skeleton width="100%" height={12} />
              <Skeleton width="75%" height={12} />
            </div>

            {/* Skills row */}
            <div className="flex gap-1">
              <Skeleton width={60} height={20} rounded={999} />
              <Skeleton width={50} height={20} rounded={999} />
              <Skeleton width={45} height={20} rounded={999} />
            </div>

            {/* Footer: model tag + uses count */}
            <div className="flex items-center justify-between mt-auto">
              <Skeleton width={80} height={20} rounded={999} />
              <Skeleton width={55} height={11} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
