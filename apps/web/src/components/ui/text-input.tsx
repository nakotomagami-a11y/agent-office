import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Render with a label-like inset visual. */
  invalid?: boolean;
  variant?: "default" | "soft";
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, type = "text", invalid, variant = "default", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        variant === "soft"
          ? "w-full h-[44px] px-[14px] bg-card-2 rounded-[12px] text-txt text-[13px] outline-none border-0 transition-shadow duration-[140ms] focus:shadow-[0_0_0_2px_var(--acc-line)] disabled:opacity-60"
          : "w-full h-8 px-[10px] bg-bg-1 rounded-md text-txt text-[13px] outline-none shadow-1 [font:inherit] border focus:border-acc",
        invalid && (variant === "soft" ? "shadow-[0_0_0_2px_var(--error)]" : "border-status-error"),
        !invalid && variant === "default" && "border-line-2",
        className,
      )}
      {...rest}
    />
  );
});
