import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Render with a label-like inset visual. */
  invalid?: boolean;
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, type = "text", invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn("w-full h-8 px-[10px] bg-bg-1 rounded-[var(--r-md)] text-txt text-[13px] outline-none shadow-[var(--shadow-1)] [font:inherit] border", invalid ? "border-status-error" : "border-line-2", className)}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "var(--acc)";
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = invalid ? "var(--error)" : "var(--line-2)";
        rest.onBlur?.(e);
      }}
      {...rest}
    />
  );
});
