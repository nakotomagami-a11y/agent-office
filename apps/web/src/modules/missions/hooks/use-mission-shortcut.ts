"use client";

import { useSyncExternalStore } from "react";

const never = () => () => {};
const onMac = () => /Mac|iPhone|iPad/i.test(navigator.userAgent);

/** The composer opens Missions on Ctrl+P or Cmd+P; a Mac user should read ⌘. The server render
 *  cannot know, so it says Ctrl and the client corrects it after hydration. */
export function useMissionShortcut(): { mac: boolean; aria: string } {
  const mac = useSyncExternalStore(never, onMac, () => false);
  return { mac, aria: mac ? "Meta+P" : "Control+P" };
}
