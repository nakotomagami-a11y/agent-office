import { describe, it, expect } from "vitest";
import { parseResetTimeFromMessage } from "./parse-reset-time";

/** Wall-clock "HH:MM" of an epoch as read in a given timezone. */
function clockIn(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
}

describe("parseResetTimeFromMessage", () => {
  const now = new Date("2026-08-04T12:00:00Z");

  it("parses the real session-limit message and targets that wall clock in the tz", () => {
    const ms = parseResetTimeFromMessage("You've hit your session limit · resets 10:10pm (Africa/Cairo)", now);
    expect(ms).toBeDefined();
    expect(clockIn(ms!, "Africa/Cairo")).toBe("22:10");
    expect(ms!).toBeGreaterThan(now.getTime());
  });

  it("handles 'resets at 9am' with no timezone (local)", () => {
    const ms = parseResetTimeFromMessage("Rate limited. resets at 9am", now);
    expect(ms).toBeDefined();
    expect(ms!).toBeGreaterThan(now.getTime());
  });

  it("rolls to the next day when the time already passed today", () => {
    // now is 12:00 UTC; 01:00 UTC has passed → must be tomorrow.
    const ms = parseResetTimeFromMessage("resets 1:00 (UTC)", now);
    expect(ms).toBeDefined();
    expect(ms! - now.getTime()).toBeGreaterThan(12 * 60 * 60 * 1000);
    expect(clockIn(ms!, "UTC")).toBe("01:00");
  });

  it("returns undefined when there is no reset time", () => {
    expect(parseResetTimeFromMessage("Some unrelated build error", now)).toBeUndefined();
  });
});
