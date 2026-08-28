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
        "h-8 py-0 pr-7 pl-[10px] bg-bg-1 border border-line-2 rounded-md text-txt [font:inherit] text-[13px] outline-none cursor-pointer shadow-1 appearance-none bg-no-repeat",
        className,
      )}
      style={{
        // Two CSS gradient triangles instead of an SVG data-URI: `var()`
        // doesn't resolve inside an encoded SVG document. Mirrors the
        // `.ao-select` chevron in modal.css.
        backgroundImage:
          "linear-gradient(45deg, transparent 50%, var(--txt-3) 50%), linear-gradient(135deg, var(--txt-3) 50%, transparent 50%)",
        backgroundPosition: "calc(100% - 16px) 50%, calc(100% - 11px) 50%",
        backgroundSize: "5px 5px, 5px 5px",
      }}
      {...rest}
    >
      {children}
    </select>
  );
});
