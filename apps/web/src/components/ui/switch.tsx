import { cn } from "@/lib/cn";

/** A small on/off switch. Controlled — pass `checked` and handle `onChange`. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-[34px] h-[19px] rounded-full shrink-0 cursor-pointer transition-colors duration-[140ms]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc",
        disabled && "opacity-40 cursor-not-allowed",
        checked ? "bg-acc" : "bg-bg-3 border border-line-2",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] left-[2px] w-[15px] h-[15px] rounded-full bg-white [box-shadow:0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-[140ms]",
          checked && "translate-x-[15px]",
        )}
      />
    </button>
  );
}
