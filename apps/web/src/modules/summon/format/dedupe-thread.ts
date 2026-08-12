import type { ThreadItem } from "./thread-types";

/**
 * Collapse consecutive identical user ("you") bubbles into one.
 *
 * The chat can double-add a user message when a resume / queue-drain / recovery
 * effect re-fires — which happens often because the dev server restarts (any
 * edit to a server-side file kills + re-hydrates the run) and the panel replays
 * the active run on remount. "you" items get a fresh `y_<timestamp>` id on every
 * add, so nothing downstream can dedupe them by id.
 *
 * This is a pure, idempotent guard: if a "you" item has the same text as the
 * immediately-preceding "you" item (no other conversational content between
 * them), drop the later copy. A legitimate re-send always has agent output — or
 * at least a gap — between the two, so this never collapses real messages.
 */
export function dedupeThread(items: ThreadItem[]): ThreadItem[] {
  const out: ThreadItem[] = [];
  for (const item of items) {
    const prev = out[out.length - 1];
    if (item.kind === "you" && prev?.kind === "you" && prev.text === item.text) {
      continue;
    }
    out.push(item);
  }
  return out;
}
