"use client";

import { Portal } from "./portal";
import { Icon } from "./icon";
import { useToastStore } from "@/lib/toast-store";

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <Portal>
      <div className="fixed z-[400] bottom-4 right-4 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-[10px] min-w-[240px] max-w-[380px] px-[14px] py-[11px] rounded-[var(--ao-radius-md)] bg-ao-bg-2 border border-ao-line-2 shadow-[var(--ao-shadow-modal)] text-ao-fg-0 text-[13px]"
          >
            <span className="w-[6px] h-[6px] rounded-full bg-[var(--ao-accent)] shadow-[0_0_6px_var(--ao-accent)] shrink-0" />
            <span className="flex-1 leading-[1.4]">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="text-ao-fg-3 hover:text-ao-fg-0 transition-colors duration-[120ms] shrink-0"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        ))}
      </div>
    </Portal>
  );
}
