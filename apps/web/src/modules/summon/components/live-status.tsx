"use client";

export type ChatPhase =
  | "idle"
  | "sending"
  | "connecting"
  | "working"
  | "streaming"
  | "done"
  | "error"
  | "aborted";

const dot = "w-[4px] h-[4px] bg-[var(--acc)] rounded-full shrink-0 animate-[ao-typing_1.2s_infinite]";

function TypingDots() {
  return (
    <span className="inline-flex gap-[3px]" aria-hidden>
      <span className={dot} />
      <span className={`${dot} [animation-delay:0.15s]`} />
      <span className={`${dot} [animation-delay:0.3s]`} />
    </span>
  );
}

/** "Thinking" label with a light sweeping across the text — the reference
 *  design's `aoShimmer` gradient-text treatment, distinct from the plain
 *  gray labels used for the brief "Connecting…"/"Sending…" states. Shown
 *  while the agent has no visible output yet (tool calls only). */
function ShimmerLabel({ children }: { children: string }) {
  return (
    <span
      className="text-[12.5px] font-bold tracking-[-0.01em] whitespace-nowrap bg-clip-text text-transparent bg-no-repeat animate-[ao-label-shimmer_1.7s_linear_infinite]"
      style={{
        backgroundImage: "linear-gradient(90deg,var(--txt-4) 0%,var(--txt) 45%,var(--txt-4) 90%)",
        backgroundSize: "220px 100%",
      }}
    >
      {children}
    </span>
  );
}

/**
 * The still-running indicator inside the live turn's activity row —
 * dots + (optionally) what the agent's doing, no pill/border/background.
 * The reference design renders this as a plain inline element in the same
 * flat list as the tool-call rows below it; the elapsed stopwatch and the
 * Stop button that sit alongside it are `chat-thread.tsx`'s job (they need
 * the live turn's timing data, which this component doesn't have).
 */
export function LiveStatus({ phase, hint }: { phase: ChatPhase; hint?: string }) {
  if (phase === "idle" || phase === "done" || phase === "aborted") return null;

  if (phase === "error") {
    return (
      <span className="text-[12.5px] text-[var(--error)]" role="status" aria-live="polite">
        {hint ? `Error: ${hint}` : "Run failed"}
      </span>
    );
  }

  if (phase === "connecting" || phase === "sending") {
    return (
      <span className="flex items-center gap-[8px] text-[12.5px] text-[var(--txt-3)]" role="status" aria-live="polite">
        <TypingDots />
        {phase === "connecting" ? "Connecting…" : "Sending…"}
      </span>
    );
  }

  if (phase === "working") {
    return (
      <span className="flex items-center gap-[8px]" role="status" aria-live="polite">
        <TypingDots />
        <ShimmerLabel>Thinking</ShimmerLabel>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-[8px] text-[12.5px] text-[var(--txt-3)]" role="status" aria-live="polite">
      <TypingDots />
      {hint && (
        <span className="font-[var(--font-mono)] text-[11.5px] text-[var(--txt-4)] px-[6px] py-[1px] bg-[var(--bg-3)] border border-[var(--line)] rounded-[4px] max-w-[280px] overflow-hidden text-ellipsis whitespace-nowrap">
          {hint}
        </span>
      )}
    </span>
  );
}
