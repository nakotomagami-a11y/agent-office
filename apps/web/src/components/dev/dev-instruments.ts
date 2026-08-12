import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { useOfficeDragStore } from "@/modules/office/hooks/use-office-drag";
import { useAgentCapStore } from "@/modules/office/hooks/use-agent-cap-store";
import { useSummonStore } from "@/modules/summon/hooks/use-summon-store";
import { usePerformanceStore } from "@/lib/performance-store";
import { useThemeStore } from "@/lib/theme-store";
import { useTabsStore } from "@/lib/tabs-store";
import { useBranchStore } from "@/lib/branch-store";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { useCompareStore } from "@/lib/compare-store";
import { useProcessesStore } from "@/lib/processes-store";
import { useClaudeLimitsStore } from "@/lib/claude-limits-store";
import { useFlutterStore } from "@/lib/flutter-store";
import { useDevServerStore } from "@/lib/dev-server-store";
import { usePaletteStore } from "@/lib/palette-store";

type Readable = { getState: () => unknown };

/** Every client-side Zustand store, keyed by a short label. */
const STORES: Record<string, Readable> = {
  office: useOfficeStore,
  officeDrag: useOfficeDragStore,
  agentCap: useAgentCapStore,
  summon: useSummonStore,
  performance: usePerformanceStore,
  theme: useThemeStore,
  tabs: useTabsStore,
  branch: useBranchStore,
  activeProject: useActiveProjectStore,
  compare: useCompareStore,
  processes: useProcessesStore,
  claudeLimits: useClaudeLimitsStore,
  flutter: useFlutterStore,
  devServer: useDevServerStore,
  palette: usePaletteStore,
};

function collectStores(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, s] of Object.entries(STORES)) {
    try {
      out[k] = s.getState();
    } catch {
      out[k] = "<unavailable>";
    }
  }
  return out;
}

/** Log every store's current state to the console, grouped. */
export function dumpStores(): void {
  const snap = collectStores();
  // eslint-disable-next-line no-console
  console.groupCollapsed("%c[dev] Zustand stores", "color:#8b5cf6;font-weight:bold");
  for (const [k, v] of Object.entries(snap)) {
    // eslint-disable-next-line no-console
    console.log(`%c${k}`, "font-weight:bold", v);
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
}

/** Build a JSON-serialisable snapshot of app state (functions dropped). */
export function appStateSnapshot(): string {
  const snapshot = {
    ts: new Date().toISOString(),
    env: process.env.NODE_ENV,
    version: process.env.NEXT_PUBLIC_APP_VERSION,
    commit: process.env.NEXT_PUBLIC_GIT_SHA || null,
    url: typeof location !== "undefined" ? location.href : null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    stores: collectStores(),
  };
  return JSON.stringify(snapshot, (_k, v) => (typeof v === "function" ? undefined : v), 2);
}
