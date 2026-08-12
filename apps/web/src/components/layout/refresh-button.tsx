"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { useRefresh } from "@/hooks/use-refresh";

/**
 * Titlebar refresh affordance — the in-app equivalent of the browser's
 * reload button.
 *
 * Wired to `useRefresh`, which also installs the global Ctrl/Cmd+R capture,
 * so this button and the shortcut share the exact same behaviour. The icon
 * spins for ~700ms after each refresh so the user gets a visible ack even
 * when the invalidated queries return instantly from the browser cache.
 */
export function RefreshButton() {
  const t = useTranslations();
  const { refresh, refreshing } = useRefresh();

  const label = t("titlebar.refresh_label");
  const tooltip = t("titlebar.refresh_tooltip");

  return (
    <Tooltip content={tooltip} side="bottom" delayMs={400}>
      <button
        type="button"
        onClick={refresh}
        aria-label={label}
        className="h-[24px] w-[24px] inline-flex items-center justify-center bg-transparent border border-transparent rounded-sm text-txt-2 cursor-pointer hover:bg-bg-2 hover:border-line disabled:opacity-60"
      >
        <Icon
          name="refresh"
          size={13}
          className={refreshing ? "[animation:spin_0.7s_linear]" : undefined}
        />
      </button>
    </Tooltip>
  );
}
