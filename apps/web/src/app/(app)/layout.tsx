import { Suspense, type ReactNode } from "react";
import { GnomeWindow } from "@/components/layout/gnome-window";
import { Titlebar } from "@/components/layout/titlebar";
import { TabStrip } from "@/components/layout/tab-strip";
import { TabsRouterSync } from "@/components/layout/tabs-router-sync";
import { TabsKeyboard } from "@/components/layout/tabs-keyboard";
import { MainShell } from "@/components/layout/main-shell";
import { AgentDetailsModal } from "@/modules/office/components/agent-details";
import { ProcessesModal } from "@/modules/processes/components/processes-modal";
import { FirstRunGate } from "@/modules/onboarding/components/first-run-gate";
import { AgentMigrationTrigger } from "@/modules/agents/components/agent-migration-trigger";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { CompareModal } from "@/modules/runs/components/compare-modal";
import { ModalUrlSync } from "@/components/modal-url-sync";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { FlutterModal } from "@/modules/flutter/components/flutter-modal";
import { ResizeHandles } from "@/components/layout/resize-handles";
import { AgentCapModalMount } from "@/modules/office/components/agent-cap-modal-mount";
import { RootSignInModal } from "@/modules/accounts/components/root-sign-in-modal";
import { Toaster } from "@/components/ui/toaster";
/**
 * Group layout for in-app pages (everything except auth, if/when added).
 * Wraps every protected page in the GNOME window chrome + sidebar, plus
 * global overlays (agent-details + Claude limits modals) so any trigger
 * elsewhere in the app can open them.
 *
 * The Titlebar is rendered as a SIBLING of GnomeWindow (not a child) so it
 * sits in its own stacking context above any portal-rendered modal. The
 * GnomeWindow reserves a 38px row at the top for the titlebar to overlay.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
    <ResizeHandles />
    <GnomeWindow>
      <MainShell>{children}</MainShell>
      <AgentDetailsModal />
      <ProcessesModal />
      <CommandPalette />
      <CompareModal />
      <FirstRunGate />
      <AgentMigrationTrigger />
      <Suspense><ModalUrlSync /></Suspense>
      <MobileBottomNav />
      <FlutterModal />
      <AgentCapModalMount />
      <RootSignInModal />
    </GnomeWindow>
    <Titlebar />
    <TabStrip />
    <Toaster />
    <Suspense><TabsRouterSync /></Suspense>
    <TabsKeyboard />
    </>
  );
}
