"use client";

import { create } from "zustand";

/**
 * Identifies a draggable agent. When a project is active and the user
 * drags a roster row, instanceId is set; from the agent gallery (no
 * instance scope) only agentId is set. The office map uses these two
 * fields to derive a stable unique key for placement.
 */
export type DragRef = {
  agentId: string;
  instanceId?: string;
};

type OfficeDragState = {
  /** Set on sidebar onDragStart; cleared on dragEnd. Null when no drag is in
   *  progress. The office map subscribes to this so it can show a hover
   *  preview at the cell the cursor is over. */
  dragging: DragRef | null;
  setDragging: (ref: DragRef | null) => void;
};

export const useOfficeDragStore = create<OfficeDragState>((set) => ({
  dragging: null,
  setDragging: (ref) => set({ dragging: ref }),
}));

/** MIME type used in `DataTransfer` so onDragOver can verify our payload
 *  is being dragged (the actual JSON payload is only readable on drop). */
export const AGENT_DRAG_MIME = "application/x-agent-office-agent+json";

/** Encode a DragRef as a stable key - used both inside the position map
 *  to dedupe (same agent dragged to a new cell moves rather than
 *  duplicates) and as the value stored at "x,y". */
export function dragRefKey(ref: DragRef): string {
  return ref.instanceId ? `i:${ref.instanceId}` : `a:${ref.agentId}`;
}
