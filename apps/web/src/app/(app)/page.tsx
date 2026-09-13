"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";
import { usePerformanceStore } from "@/lib/performance-store";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { useSettings } from "@/modules/settings/hooks/use-settings";

const OfficeView = dynamic(
  () => import("@/modules/office/components/office-view").then((m) => m.OfficeView),
  { ssr: false },
);

/**
 * Root route ("/") — the office island, but only while the isometric view
 * integration is actually usable (matches `OfficeView`'s own gate). With it
 * off, `/` used to render a dead "turn this on in Settings" page — the very
 * first thing a user with iso disabled saw on every launch, since `/` is
 * this app's landing route. There's always something more useful to land
 * on: the active project's dashboard, or the projects list if none is open
 * (same fallback the "Project" nav entry itself already uses).
 *
 * Waits for settings + the active-project store to finish hydrating before
 * redirecting — both default to the "iso off" / "no project" values while
 * loading, so redirecting on the very first render risks bouncing a user
 * who actually has iso enabled straight back out again.
 */
export default function OfficePage() {
  const router = useRouter();
  const settingsQ = useSettings();
  const isoEnabled = useOfficeStore((s) => s.isoEnabled);
  const perfMode = usePerformanceStore((s) => s.mode);
  const activeProjectId = useActiveProjectStore((s) => s.id);
  const activeProjectHydrated = useActiveProjectStore((s) => s.hydrated);
  const canUseIso = isoEnabled && perfMode === "full";
  const settled = !settingsQ.isLoading && activeProjectHydrated;

  useEffect(() => {
    if (!settled || canUseIso) return;
    router.replace(activeProjectId ? PAGE_ROUTES.project(activeProjectId) : PAGE_ROUTES.projects);
  }, [settled, canUseIso, activeProjectId, router]);

  // Nothing renders until settled: `OfficeView` itself would otherwise flash
  // its own "iso is off" dead end during the brief hydration window (both
  // stores default to "off"/"no project" before their real values load),
  // right before this effect redirects away from it anyway.
  if (!settled) return null;
  if (!canUseIso) return null;
  return <OfficeView />;
}
