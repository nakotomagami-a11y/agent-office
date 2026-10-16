// What a seat must hear about posts that never went out. Delivered by the poller, which only sends
// to a seat whose hub is readable and that is seated, unpaused, under its cap and idle: a hub that
// stays blocked cannot loop turns. In memory, so a restart loses them (docs/missions.md).
// Keyed by the seat's chat, so a seat claimed again on this device starts clean.
const pending = new Map<string, string[]>();

export function noteForSeat(instanceId: string, text: string): void {
  pending.set(instanceId, [...(pending.get(instanceId) ?? []), text]);
}

export function takeSeatNotes(instanceId: string): string[] {
  const notes = pending.get(instanceId) ?? [];
  pending.delete(instanceId);
  return notes;
}
