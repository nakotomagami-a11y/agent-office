"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  label?: ReactNode;
};

export function Checkbox({
  label,
  className,
  disabled,
  checked,
  defaultChecked,
  onChange,
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
            "appearance-none w-4 h-4 m-0 rounded-md border-2 border-line-2 bg-bg-1",
            disabled ? "cursor-not-allowed" : "cursor-pointer",
          )}
          {...rest}
        />
        {on && (
          <span className="absolute inset-0 inline-flex items-center justify-center rounded-md border-2 border-acc bg-acc pointer-events-none">
            <Icon name="check" size={11} className="text-white" />
          </span>
        )}
      </span>
      {label}
    </label>
  );
}
