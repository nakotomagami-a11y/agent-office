import { describe, it, expect } from "vitest";
import { applySseEvent } from "./parse-sse-event";
import type { ThreadItem, UsageMeter } from "./thread-types";

const emptyUsage: UsageMeter = { tokensIn: 0, tokensOut: 0, cost: 0 };
const limitMsg = "You've hit your session limit · resets 9:40am (Africa/Cairo)";

describe("applySseEvent rate-limit dedupe", () => {
  it("drops the trailing agent-text echo of the limit message", () => {
    const thread: ThreadItem[] = [
      { kind: "you", id: "u1", text: "retry" },
      { kind: "agent-text", id: "a1", text: limitMsg, streaming: true },
    ];
    const res = applySseEvent(
      { thread, usage: emptyUsage },
      { name: "rate-limit", data: { runId: "r1", message: limitMsg, resetsAt: 123, severity: "limit" } },
    );
    // The echoed agent-text is gone; only the user turn + the card remain.
    expect(res.thread.map((t) => t.kind)).toEqual(["you", "system-rate-limit"]);
    const card = res.thread.at(-1)!;
    expect(card.kind === "system-rate-limit" && card.message).toBe(limitMsg);
  });

  it("keeps unrelated trailing agent-text", () => {
    const thread: ThreadItem[] = [
      { kind: "agent-text", id: "a1", text: "Working on the wardrobe panel.", streaming: false },
    ];
    const res = applySseEvent(
      { thread, usage: emptyUsage },
      { name: "rate-limit", data: { runId: "r1", message: limitMsg, resetsAt: 123, severity: "limit" } },
    );
    expect(res.thread.map((t) => t.kind)).toEqual(["agent-text", "system-rate-limit"]);
  });
});
