import type { HubSeatView, PendingClaim, SeatView } from "@agent-office/domain/types";

/** How a status reads: `ok` green, `wait` amber, `muted`/`dim` two greys. */
export type Tone = "ok" | "wait" | "muted" | "dim";

export const canClaim = (s: HubSeatView) => !s.taken && !s.mine && s.fits;

export type HubSeatStatus = "pending" | "mine" | "taken" | "wrong_os" | "open";

/** A seat in the Join list, as this device sees it. */
export function hubSeatStatus(s: HubSeatView, pending: boolean): { key: HubSeatStatus; tone: Tone } {
  if (pending) return { key: "pending", tone: "wait" };
  // `mine` is set at claim time, before the lead accepts: it does not mean the seat is held.
  if (s.mine) return { key: "mine", tone: "muted" };
  if (s.taken) return { key: "taken", tone: "dim" };
  if (!s.fits) return { key: "wrong_os", tone: "dim" };
  return { key: "open", tone: "ok" };
}

export type StartedSeatStatus = "starting" | "waiting" | "running_here" | "accepted" | "wanted";

/** A seat right after Start. `live` is null until the first fold from GitHub arrives. */
export function startedSeatStatus(live: Pick<SeatView, "mine" | "device"> | null, claim: PendingClaim | undefined, lead: boolean): { key: StartedSeatStatus; tone: Tone; device?: string } {
  if (!live) return lead ? { key: "starting", tone: "dim" } : { key: "waiting", tone: "dim" };
  if (live.mine) return { key: "running_here", tone: "ok" };
  if (live.device) return { key: "accepted", tone: "ok", device: live.device };
  if (claim) return { key: "wanted", tone: "wait", device: claim.device };
  return { key: "waiting", tone: "dim" };
}
