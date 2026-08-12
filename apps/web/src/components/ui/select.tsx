import { forwardRef, type SelectHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-8 py-0 pr-7 pl-[10px] bg-bg-1 border border-line-2 rounded-md text-txt [font:inherit] text-[13px] outline-none cursor-pointer shadow-1 appearance-none bg-no-repeat bg-[right_8px_center] bg-[length:16px]",
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238A8079' stroke-width='1.7'><path d='m6 9 6 6 6-6'/></svg>\")",
      }}
      {...rest}
    >
      {children}
    </select>
  );
});
