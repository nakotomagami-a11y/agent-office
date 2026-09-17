"use client";

import { useEffect, useRef } from "react";
import { usePerformanceStore } from "@/lib/performance-store";

const POWER_ENDPOINT = "/api/power";
const POLL_MS = 30_000;

/**
 * Drives auto performance-mode switching from the machine's power source.
 * Renders nothing.
 *
 * Source of truth is the local sysfs reader (`/api/power`) — reliable and
 * immune to the Battery Status API's "full battery reports not charging" trap.
 * When the Battery Status API is available (WebKitGTK exposes it), its
 * `chargingchange` event is used purely as a *trigger* to re-poll sysfs so
 * plug/unplug is reflected instantly instead of waiting for the next poll.
 * A 30s interval is the backstop for engines without the event.
 */
export function PowerSync() {
  const applyPowerState = usePerformanceStore((s) => s.applyPowerState);
  const auto = usePerformanceStore((s) => s.auto);
  const applyRef = useRef(applyPowerState);
  applyRef.current = applyPowerState;

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(POWER_ENDPOINT, { cache: "no-store" });
        const data = (await res.json()) as { onAc: boolean | null };
        if (!cancelled && data.onAc !== null) applyRef.current(data.onAc);
      } catch {
        /* offline / unsupported — ignore, interval will retry */
      }
    };

    void poll();
    const id = window.setInterval(poll, POLL_MS);

    // Battery Status API: instant plug/unplug trigger (re-poll sysfs on event).
    type BatteryLike = {
      addEventListener: (t: string, cb: () => void) => void;
      removeEventListener: (t: string, cb: () => void) => void;
    };
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryLike>;
    };
    let battery: BatteryLike | null = null;
    const onChange = () => void poll();
    if (typeof nav.getBattery === "function") {
      nav
        .getBattery()
        .then((b) => {
          if (cancelled) return;
          battery = b;
          b.addEventListener("chargingchange", onChange);
        })
        .catch(() => {
          /* no Battery API — the interval poll covers us */
        });
    }

    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (battery) battery.removeEventListener("chargingchange", onChange);
    };
    // Re-run when `auto` flips on so we reconcile immediately (setAuto also
    // reconciles from the last known power state; this re-poll refreshes it).
  }, [auto]);

  return null;
}
