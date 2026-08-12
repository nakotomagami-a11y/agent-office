import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTranscriptSaver, type SaveArgs } from "./throttle-save";

function args(over: Partial<SaveArgs> = {}): SaveArgs {
  return { tKey: "a::default", thread: [], activeRunId: "run-1", sessionId: null, queuedMessages: [], ...over };
}

describe("createTranscriptSaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces many token-updates during a run into one save per window", () => {
    const save = vi.fn();
    const saver = createTranscriptSaver(save, 1000);

    for (let i = 0; i < 200; i++) saver.schedule(args({ thread: [{ kind: "you", id: `y${i}`, text: `${i}` }] }));
    expect(save).not.toHaveBeenCalled(); // nothing flushed mid-window

    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1); // 200 mutations → 1 save
  });

  it("trailing save carries the newest data, not the first", () => {
    const save = vi.fn();
    const saver = createTranscriptSaver(save, 1000);

    saver.schedule(args({ thread: [{ kind: "agent-text", id: "a", text: "first", streaming: true }] }));
    saver.schedule(args({ thread: [{ kind: "agent-text", id: "a", text: "final", streaming: true }] }));
    vi.advanceTimersByTime(1000);

    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0]![0] as SaveArgs;
    expect((saved.thread[0] as { text: string }).text).toBe("final");
  });

  it("saves immediately when idle (activeRunId === null)", () => {
    const save = vi.fn();
    const saver = createTranscriptSaver(save, 1000);

    saver.schedule(args({ activeRunId: null }));
    expect(save).toHaveBeenCalledTimes(1); // no timer wait
  });

  it("idle save flushes an in-flight window too (run just finished)", () => {
    const save = vi.fn();
    const saver = createTranscriptSaver(save, 1000);

    saver.schedule(args()); // running → schedules a window
    saver.schedule(args({ activeRunId: null, sessionId: "s-1" })); // run ends
    expect(save).toHaveBeenCalledTimes(1);
    expect((save.mock.calls[0]![0] as SaveArgs).sessionId).toBe("s-1");
    expect(saver.hasPending()).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1); // no stale trailing save
  });

  it("flushPending writes the pending window (unmount case)", () => {
    const save = vi.fn();
    const saver = createTranscriptSaver(save, 1000);

    saver.schedule(args({ thread: [{ kind: "you", id: "y", text: "last" }] }));
    expect(saver.hasPending()).toBe(true);
    saver.flushPending();
    expect(save).toHaveBeenCalledTimes(1);
    expect(saver.hasPending()).toBe(false);
  });

  it("flushPending is a no-op with nothing pending", () => {
    const save = vi.fn();
    const saver = createTranscriptSaver(save, 1000);
    saver.flushPending();
    expect(save).not.toHaveBeenCalled();
  });
});
