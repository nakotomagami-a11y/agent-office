"use client";

import { useEffect, useRef } from "react";
import type { RunPhase } from "@/modules/summon/format/thread-types";

// Plays a brief 2-tone chime using the Web Audio API. No external assets.
function playDone() {
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
  } catch { /* no audio ctx available */ }
}

function playError() {
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

export interface RunNotificationOpts {
  agentName: string;
  phase: RunPhase;
  startTs: number | null; // epoch ms when run started; null = unknown
}

/**
 * Fires a browser Notification + audio chime when a run transitions to
 * "done" or "error", but only if the run lasted > 30 s (so quick pings
 * don't interrupt you for instant completions).
 *
 * Call this from any component that has access to the SSE stream phase.
 * Requests notification permission lazily on first qualifying event.
 *
 * Usage:
 *   import { useRunNotification } from "@/hooks/use-run-notification";
 *   useRunNotification({ agentName: agent.name, phase, startTs });
 */
export function useRunNotification({ agentName, phase, startTs }: RunNotificationOpts) {
  const prevPhaseRef = useRef<RunPhase>(phase);

  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (phase === prev) return;
    if (phase !== "done" && phase !== "error") return;

    const elapsed = startTs ? Date.now() - startTs : 0;
    if (elapsed < 30_000) return;

    const title = phase === "done"
      ? `${agentName} finished`
      : `${agentName} needs attention`;
    const body = phase === "done"
      ? "Run completed successfully."
      : "Run ended with an error.";

    if (phase === "done") playDone(); else playError();

    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    } else if (Notification.permission !== "denied") {
      void Notification.requestPermission().then((perm) => {
        if (perm === "granted") new Notification(title, { body, icon: "/favicon.ico" });
      });
    }
  }, [phase, agentName, startTs]);
}
