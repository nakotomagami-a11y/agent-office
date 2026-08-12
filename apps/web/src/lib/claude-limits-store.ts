import { useEffect } from "react";
import { create } from "zustand";
import { match } from "ts-pattern";
import { type LimitsPeriod, type HardCap, parseLimits as parseLimitsCore, periodStart, periodEnd } from "@/lib/claude-limits";
import { getUiSettings, patchUiSettings } from "@/lib/api/ui-settings";
import { getAccount } from "@/lib/api/account";

export type { LimitsPeriod, HardCap };
export { periodStart, periodEnd };

export type ClaudePlan = "free" | "pro" | "max" | "api" | "custom";

export interface StoredClaudeLimits {
  plan: ClaudePlan;
  /** Dollar cap for the period. 0 means "no quota set - just track usage". */
  quotaUsd: number;
  period: LimitsPeriod;
  hardCap: HardCap;
}

const DEFAULTS: StoredClaudeLimits = { plan: "free", quotaUsd: 0, period: "week", hardCap: "warn" };

type LimitsState = StoredClaudeLimits & {
  open: boolean;
  hydrated: boolean;
  setOpen: (next: boolean) => void;
  /** Update user-configurable settings only (plan is read-only — sourced from credentials). */
  update: (patch: Omit<Partial<StoredClaudeLimits>, "plan">) => void;
  hydrate: () => void;
};

function validPlan(p: unknown): p is ClaudePlan {
  return p === "free" || p === "pro" || p === "max" || p === "api" || p === "custom";
}

function parseLimits(raw: string): StoredClaudeLimits {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // Migrate legacy max-5x / max-20x values
    let plan: ClaudePlan;
    if (parsed.plan === "max-5x" || parsed.plan === "max-20x") {
      plan = "max";
    } else {
      plan = validPlan(parsed.plan) ? parsed.plan : DEFAULTS.plan;
    }

    const core = parseLimitsCore(raw);
    return { plan, quotaUsd: core.quotaUsd, period: core.period, hardCap: core.hardCap };
  } catch {
    return DEFAULTS;
  }
}

export const useClaudeLimitsStore = create<LimitsState>((set, get) => ({
  ...DEFAULTS,
  open: false,
  hydrated: false,
  setOpen: (next) => set({ open: next }),
  update: (patch) => {
    const merged = { ...get(), ...patch };
    set(merged);
    // Persist only user-configurable fields (plan comes from credentials, not stored here)
    const toSave = { quotaUsd: merged.quotaUsd, period: merged.period, hardCap: merged.hardCap };
    patchUiSettings({ "claude-limits": JSON.stringify(toSave) }).catch(() => { /* best-effort */ });
  },
  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    // Load user settings and real plan in parallel
    Promise.all([getUiSettings(), getAccount()])
      .then(([settings, account]) => {
        const stored = settings["claude-limits"];
        const limits = stored ? parseLimits(stored) : DEFAULTS;
        // Real plan from credentials always wins
        set({ ...limits, plan: account.plan });
      })
      .catch(() => { /* ignore */ });
  },
}));

export function useClaudeLimitsHydration() {
  const hydrate = useClaudeLimitsStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);
}

export function planLabel(plan: ClaudePlan): string {
  return match(plan)
    .with("free", () => "Free")
    .with("pro", () => "Pro")
    .with("max", () => "Max")
    .with("api", () => "API")
    .with("custom", () => "Custom")
    .exhaustive();
}

