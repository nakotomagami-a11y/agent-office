"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";
import { pickFolder } from "@/lib/folder-picker";
import { isTauri } from "@/lib/tauri-window";
import { toast } from "@/lib/toast-store";
import { cn } from "@/lib/cn";

const never = () => () => {};

/** Opens the system folder picker at `value`. Renders nothing in a browser tab, which can't read local paths. */
export function BrowseFolderButton({ value, onPick, className }: { value: string; onPick: (path: string) => void; className?: string }) {
  const t = useTranslations("common");
  const desktop = useSyncExternalStore(never, isTauri, () => false);
  if (!desktop) return null;
  const browse = () =>
    pickFolder(value)
      .then((p) => p && onPick(p))
      .catch((err: unknown) => {
        console.error("folder picker failed", err);
        toast(t("browse_failed"));
      });
  return (
    <button
      type="button"
      onClick={() => void browse()}
      className={cn(
        "flex items-center gap-[7px] px-[14px] py-[11px] rounded-[14px] border border-edge-2 bg-card-2 text-txt-2 text-[12.5px] font-semibold whitespace-nowrap cursor-pointer transition-all duration-150 hover:text-txt hover:border-txt-4",
        className,
      )}
    >
      <Icon name="folder" size={13} />
      {t("browse")}
    </button>
  );
}
