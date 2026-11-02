"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  label?: ReactNode;
  tone?: "acc" | "error";
};

export function Checkbox({
  label,
  className,
  disabled,
  checked,
  defaultChecked,
  onChange,
  tone = "acc",
  ...rest
}: CheckboxProps) {
  const isControlled = checked !== undefined;
  const [internal, setInternal] = useState(!!defaultChecked);
  const on = isControlled ? !!checked : internal;

  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 text-xs text-txt-2 select-none",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        className,
      )}
    >
      <span className="relative inline-flex">
        <input
          type="checkbox"
          disabled={disabled}
          checked={isControlled ? checked : undefined}
          defaultChecked={isControlled ? undefined : defaultChecked}
          onChange={(e) => {
            if (!isControlled) setInternal(e.target.checked);
            onChange?.(e);
          }}
          className={cn(
            "appearance-none w-4 h-4 m-0 rounded-[4px] border border-edge-2 bg-transparent transition-colors duration-[140ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
          {...rest}
        />
        <span
          className={cn(
            "absolute inset-0 inline-flex items-center justify-center rounded-[4px] border pointer-events-none transition-opacity duration-[140ms]",
            tone === "error" ? "border-status-error bg-status-error" : "border-acc bg-acc",
            !on && "opacity-0",
          )}
        >
          <Icon name="check" size={10} className="w-[10px] h-[10px] [flex:0_0_10px] text-white" />
        </span>
      </span>
      {label}
    </label>
  );
}
