"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Portal } from "./portal";
import { Icon } from "./icon";
import { cn } from "@/lib/cn";
import { useRegisterModal } from "@/lib/modal-manager";
import { CHROME_TOP, CHROME_LEFT_CLASS } from "@/lib/chrome";

export type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  /** Opt-in: fired when Enter is pressed while the modal is open and focus is
   *  not inside a textarea/text input. Use for confirm dialogs so Enter
   *  triggers the primary action. Omit for form modals that own Enter. */
  onEnter?: () => void;
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
  onEnter,
  title,
  footer,
  size = "md",
  maxWidth,
  children,
  className,
  closeLabel,
  bareContent = false,
}: ModalShellProps) {
  const t = useTranslations("common");
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
      if (e.key === "Enter" && onEnter) {
        const el = document.activeElement as HTMLElement | null;
        const tag = el?.tagName;
        const isTextEntry =
          tag === "TEXTAREA" ||
          (tag === "INPUT" && (el as HTMLInputElement).type !== "checkbox" && (el as HTMLInputElement).type !== "radio") ||
          el?.isContentEditable === true;
        if (!isTextEntry) {
          e.preventDefault();
          onEnter();
          return;
        }
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
  }, [open, onClose, onEnter]);

  if (!open) return null;

  return (
    <Portal>
      <div
        role="presentation"
        onClick={onClose}
        className={cn(
          "app-modal-backdrop fixed top-0 right-0 bottom-0 bg-[var(--ao-backdrop)] backdrop-blur-sm flex items-center justify-center z-[200] p-2",
          CHROME_LEFT_CLASS,
        )}
        style={{ top: CHROME_TOP }}
      >
        <div
          ref={ref}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className={cn("surface-sheen rounded-lg shadow-[var(--lift)] w-full flex flex-col outline-none", className)}
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
                aria-label={closeLabel ?? t("close")}
                className="ml-auto bg-transparent border-0 w-[26px] h-[26px] rounded-full cursor-pointer text-txt-3"
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
