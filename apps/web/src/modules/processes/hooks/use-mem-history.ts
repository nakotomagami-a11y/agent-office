"use client";

import { useRef } from "react";
import type { ProcessInfo } from "@agent-office/domain/types";

const MAX_SAMPLES = 14;

/**
 * Rolling per-pid memory history sampled from real poll data — never
 * fabricated. Each time `processes` changes (every ~5s poll while the modal
 * is open), the current `memMb` for each still-live pid is appended; pids
 * that disappear are dropped. Returns a lookup for the sparkline renderer.
 *
 * A pid with only one sample yet (just opened, or just appeared) reports a
 * flat single-point history — callers should render that as a flat line
 * rather than an empty one.
 */
export function useMemHistory(processes: ProcessInfo[]): (pid: number) => number[] {
  const historyRef = useRef<Map<number, number[]>>(new Map());

  const live = new Set(processes.map((p) => p.pid));
  for (const pid of historyRef.current.keys()) {
    if (!live.has(pid)) historyRef.current.delete(pid);
  }
  for (const p of processes) {
    const samples = historyRef.current.get(p.pid) ?? [];
    const last = samples[samples.length - 1];
    // Skip the append when it's the exact same reading already recorded
    // this render pass (avoids double-pushing on re-renders between polls).
    if (last !== p.memMb) {
      samples.push(p.memMb);
      if (samples.length > MAX_SAMPLES) samples.shift();
      historyRef.current.set(p.pid, samples);
    } else if (!historyRef.current.has(p.pid)) {
      historyRef.current.set(p.pid, samples);
    }
  }

  return (pid: number) => historyRef.current.get(pid) ?? [];
}
