import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn("w-full px-[10px] py-2 bg-bg-1 rounded-[var(--r-md)] text-txt text-[13px] leading-[1.5] outline-none resize-y shadow-[var(--shadow-1)] [font:inherit] border", invalid ? "border-status-error" : "border-line-2", className)}
      {...rest}
    />
  );
});
