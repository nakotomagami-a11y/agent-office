import { SEAT_ID, TO_ALL, TO_HUMAN, type SeatOs } from "@agent-office/domain/config/missions";
import { usdOk } from "./money";

export const seatNameOk = (n: string) => SEAT_ID.test(n) && n !== TO_HUMAN && n !== TO_ALL;

/** What the seat-name field keeps as you type: a seat id is a lowercase slug. */
export const seatName = (v: string) => v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 32);

/** The template's agents, used when this device has them; else its first agent. */
const PREFERRED = { lead: "orchestrator", seat: "developer" } as const;

export function defaultAgent(lead: boolean, installed: readonly string[]): string | null {
  const want = lead ? PREFERRED.lead : PREFERRED.seat;
  return installed.includes(want) ? want : installed[0] ?? null;
}

/** A seat's agent must exist here: the server spawns it on this device for the coordinator, and a
 *  name nobody has installed is a typo the other devices would hit later. */
export const agentInstalled = (agent: string | null, installed: readonly string[] | undefined) =>
  !!agent && !!installed?.includes(agent);

export const deviceTypes = (seats: ReadonlyArray<{ os: SeatOs }>) => new Set(seats.map((s) => s.os).filter((os) => os !== "any")).size;

export type MissingBit = "title" | "goal" | "budget" | "cap" | "cap_within_budget" | "seat_names" | "unique_seats" | "agents";

export interface StartDraft {
  title: string;
  goal: string;
  budgetUsd: number | null;
  capUsd: number | null;
  /** `agent` is what the seat resolves to (its pick, or the default). */
  seats: ReadonlyArray<{ seat: string; agent: string | null }>;
  installed: readonly string[] | undefined;
}

/** What still stops Start, in the order the form reads. */
export function missingBits(d: StartDraft): MissingBit[] {
  const names = d.seats.map((s) => s.seat);
  const bits: Array<MissingBit | false> = [
    !d.title.trim() && "title",
    !d.goal.trim() && "goal",
    !usdOk(d.budgetUsd) && "budget",
    !usdOk(d.capUsd) && "cap",
    usdOk(d.budgetUsd) && usdOk(d.capUsd) && d.capUsd > d.budgetUsd && "cap_within_budget",
    !names.every(seatNameOk) && "seat_names",
    new Set(names).size !== names.length && "unique_seats",
    !d.seats.every((s) => agentInstalled(s.agent, d.installed)) && "agents",
  ];
  return bits.filter((b): b is MissingBit => !!b);
}
