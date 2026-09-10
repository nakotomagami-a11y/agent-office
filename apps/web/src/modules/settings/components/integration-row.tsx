import type { IntegrationDef } from "@agent-office/domain/config/integrations";
import { Icon, type IconName } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

const INTEGRATION_IMAGE: Record<string, string> = {
  github: "/icons/github.png",
  flutter: "/icons/pigeon.png",
  "iso-view": "/icons/isomap.png",
  "about-you": "/icons/aboutyou.png",
};

/** One integration row: icon, label (+ status badge), description, and a toggle.
 *  Used by the first-run wizard's "Extras" step. */
export function IntegrationRow({
  def,
  enabled,
  disabled,
  onToggle,
}: {
  def: IntegrationDef;
  enabled: boolean;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-[13px] rounded-2xl border px-4 py-[13px] transition-colors",
        enabled ? "border-transparent bg-acc-soft" : "border-edge bg-card",
      )}
    >
      <span
        className={cn(
          "flex h-[54px] w-[54px] shrink-0 items-center justify-center",
          INTEGRATION_IMAGE[def.id]
            ? undefined
            : cn(
                "overflow-hidden rounded-xl",
                enabled ? "bg-acc-soft text-acc shadow-[inset_0_0_0_1px_var(--acc-line)]" : "bg-card-2 text-txt-4 shadow-[inset_0_0_0_1px_var(--edge)]",
              ),
        )}
      >
        {INTEGRATION_IMAGE[def.id] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={INTEGRATION_IMAGE[def.id]} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name={def.icon as IconName} size={22} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[8px] text-[13.5px] font-bold text-txt">
          {def.label}
          {def.status === "experimental" ? (
            <span className="rounded-full bg-amber-soft px-[7px] py-[1.5px] font-mono text-[9px] font-extrabold uppercase tracking-[0.06em] text-amber">
              Experimental
            </span>
          ) : null}
        </div>
        <div className="mt-[3px] text-[11.5px] leading-[1.5] text-txt-4">{def.description}</div>
      </div>
      <Switch checked={enabled} disabled={disabled} onChange={onToggle} label={def.label} />
    </div>
  );
}
