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

const pill = "flex items-center gap-[10px] py-2 px-[14px] bg-[var(--ao-bg-2)] border border-[var(--ao-line-1)] rounded-full text-[12.5px] text-[var(--ao-fg-1)] w-fit self-start";
const led = "relative w-[7px] h-[7px] rounded-full bg-[var(--ao-accent)] shrink-0 after:content-[''] after:absolute after:inset-0 after:rounded-full after:bg-[var(--ao-accent)] after:animate-[ao-ping_1.5s_ease-out_infinite]";
const dot1 = "w-[4px] h-[4px] bg-[var(--ao-fg-2)] rounded-full animate-[ao-typing_1.2s_infinite]";
const dot2 = "w-[4px] h-[4px] bg-[var(--ao-fg-2)] rounded-full animate-[ao-typing_1.2s_infinite] [animation-delay:0.15s]";
const dot3 = "w-[4px] h-[4px] bg-[var(--ao-fg-2)] rounded-full animate-[ao-typing_1.2s_infinite] [animation-delay:0.3s]";

function TypingDots() {
  return (
    <span className="inline-flex gap-[2px]" aria-hidden>
      <span className={dot1} /><span className={dot2} /><span className={dot3} />
    </span>
  );
}

export function LiveStatus({ phase, hint }: { phase: ChatPhase; hint?: string }) {
  if (phase === "idle" || phase === "done" || phase === "aborted") return null;

  if (phase === "streaming") {
    return (
      <div className={pill} role="status" aria-live="polite">
        <span className={led} aria-hidden />
        Typing
        <TypingDots />
      </div>
    );
  }

  if (phase === "working") {
    return (
      <div className={pill} role="status" aria-live="polite">
        <span className={led} aria-hidden />
        {hint ? (
          <>
            Using
            <span className="font-mono text-[11.5px] text-[var(--ao-fg-2)] px-[6px] py-[1px] bg-[var(--ao-bg-3)] border border-[var(--ao-line-1)] rounded-[4px] max-w-[280px] overflow-hidden text-ellipsis whitespace-nowrap">{hint}</span>
          </>
        ) : (
          <>
            Working
            <TypingDots />
          </>
        )}
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div
        className={`${pill} border-[rgba(217,83,79,0.3)]`}
        role="status"
        aria-live="polite"
      >
        <span className="w-[7px] h-[7px] rounded-full bg-[var(--ao-bad)] shrink-0" aria-hidden />
        <span className="text-[var(--ao-bad)]">{hint ? `Error: ${hint}` : "Run failed"}</span>
      </div>
    );
  }

  return (
    <div className={pill} role="status" aria-live="polite">
      <span className={led} aria-hidden />
      {phase === "connecting" ? "Connecting…" : "Sending…"}
    </div>
  );
}
