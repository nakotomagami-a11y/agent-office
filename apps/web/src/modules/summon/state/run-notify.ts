"use client";

/**
 * Decides whether a run's outcome is worth interrupting the user for, and
 * performs the actual notification (chime + desktop `Notification`).
 *
 * Split out of the stream registry so the "is this worth a ding" policy is
 * one small, readable, independently-reasonable unit — the registry just
 * calls `notifyRunOutcome` at the one authoritative moment a run's outcome
 * is first known, and this module owns what "worth a ding" means.
 *
 * Why this exists as its own module instead of a React hook (the previous
 * design, `hooks/use-run-notification.ts`): a hook's lifetime is tied to
 * whichever component happens to have it mounted, which — for a chat panel
 * that remounts on every project-tab switch, every modal open/close, and
 * every dev Fast Refresh — has nothing to do with the run's actual
 * lifecycle. That mismatch was the root cause of the chime firing on stale
 * replays and firing twice when two panels watched the same run. Read the
 * call site in `run-stream-registry.ts` for how a single, run-scoped
 * decision replaces that per-mount guessing.
 */

export type RunOutcomeKind = "done" | "error" | "rate-limit";

/** Runs shorter than this don't buzz — a quick ping doesn't need an alert. */
const MIN_NOTIFY_DURATION_MS = 30_000;

/** Plays a brief two-tone "success" chime using the Web Audio API. No external assets. */
function playSuccessChime(): void {
  try {
    const ctx = new AudioContext();
    [440, 550].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.3);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.3);
    });
  } catch { /* no audio ctx available (e.g. autoplay policy before user gesture) */ }
}

/** Plays a single low "needs attention" tone using the Web Audio API. No external assets. */
function playAttentionChime(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 220;
    osc.type = "sawtooth";
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch { /* no audio ctx available */ }
}

function showDesktopNotification(title: string, body: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  } else if (Notification.permission !== "denied") {
    void Notification.requestPermission().then((perm) => {
      if (perm === "granted") new Notification(title, { body, icon: "/favicon.ico" });
    });
  }
}

export interface RunOutcomeInput {
  kind: RunOutcomeKind;
  agentName: string | undefined;
  /**
   * How long the run actually ran for, in ms, from the most authoritative
   * source available (server-reported `durationMs` first, client-observed
   * live window as a fallback). `undefined` means truly unknown — treated
   * as "long enough to notify" since we have no evidence otherwise.
   */
  durationMs: number | undefined;
}

const COPY: Record<RunOutcomeKind, (agentName: string) => { title: string; body: string }> = {
  done: (agentName) => ({ title: `${agentName} finished`, body: "Run completed successfully." }),
  error: (agentName) => ({ title: `${agentName} needs attention`, body: "Run ended with an error." }),
  "rate-limit": (agentName) => ({
    title: `${agentName} needs a reply`,
    body: "Hit a usage limit and stopped — schedule a resume to continue.",
  }),
};

/**
 * Fires the chime + desktop notification for a run outcome, subject to the
 * "don't buzz for a quick run" rule. Rate-limit hits always notify — a run
 * that just got blocked on quota is worth surfacing immediately regardless
 * of how long it had been running.
 *
 * Callers are responsible for calling this AT MOST ONCE per run outcome —
 * see the `notified` guard in `run-stream-registry.ts`. This function has
 * no memory of its own; it's a pure "should this ding, and what does it
 * say" policy plus the side effect of dinging.
 */
export function notifyRunOutcome({ kind, agentName, durationMs }: RunOutcomeInput): void {
  if (typeof window === "undefined") return;

  const tooQuick = kind !== "rate-limit" && durationMs !== undefined && durationMs < MIN_NOTIFY_DURATION_MS;
  if (tooQuick) return;

  if (kind === "done") playSuccessChime(); else playAttentionChime();

  const { title, body } = COPY[kind](agentName ?? "Agent");
  showDesktopNotification(title, body);
}
