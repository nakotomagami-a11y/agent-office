"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Portal } from "./portal";
import { Icon } from "./icon";
import { cn } from "@/lib/cn";
import { useRegisterModal } from "@/lib/modal-manager";

export type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Footer slot - usually action buttons. */
  footer?: ReactNode;
  /** Width preset. */
  size?: "sm" | "md" | "lg";
  /** Override the max-width in pixels (takes precedence over size). */
  maxWidth?: number;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  /** Drop the default 16px content padding (for tabbed/chat layouts). */
  bareContent?: boolean;
};

const SIZE_PX: Record<NonNullable<ModalShellProps["size"]>, number> = {
  sm: 380,
  md: 560,
  lg: 820,
};

export function ModalShell({
  open,
  onClose,
  title,
  footer,
  size = "md",
  maxWidth,
  children,
  className,
  closeLabel = "Close",
  bareContent = false,
}: ModalShellProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Single-active-modal: opening this closes any other open modal.
  useRegisterModal(open, onClose);

  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const previousActive = document.activeElement as HTMLElement | null;
    dialog?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      previousActive?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <div
        role="presentation"
        onClick={onClose}
        className="app-modal-backdrop fixed inset-0 bg-[rgba(10,10,18,0.55)] backdrop-blur-sm flex items-center justify-center z-[200]"
        style={{ top: 74, padding: 8 }}
      >
        <div
          ref={ref}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className={cn("bg-bg-1 border border-line rounded-[8px] shadow-1 w-full flex flex-col outline-none", className)}
          style={{
            maxWidth: maxWidth ?? SIZE_PX[size],
            maxHeight: "calc(100vh - 90px)",
          }}
        >
          {title ? (
            <div className="border-b border-line flex items-center gap-[10px] px-4 py-3">
              <span className="font-bold text-[13px]">{title}</span>
              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="ml-auto bg-transparent border-0 w-[26px] h-[26px] rounded-full cursor-pointer text-[var(--txt-3)]"
              >
                <Icon name="x" />
              </button>
            </div>
          ) : null}
          <div
            style={
              bareContent
                ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }
                : { padding: 16, overflow: "auto" }
            }
          >
            {children}
          </div>
          {footer ? (
            <div className="p-3 border-t border-line flex gap-2 justify-end">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </Portal>
  );
}
