import type { IntegrationDef } from "@agent-office/domain/config/integrations";
import { Icon, type IconName } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";

/** One integration row: icon, label (+ status badge), description, and a toggle.
 *  Shared by the Settings → Integrations tab and the first-run wizard step. */
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
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-bg-2 border border-line">
      <span className="text-txt-3 shrink-0 mt-[1px]">
        <Icon name={def.icon as IconName} size={15} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[12.5px] font-medium text-txt">
          {def.label}
          {def.status === "experimental" ? (
            <span className="text-[9.5px] font-mono uppercase tracking-[0.06em] px-[5px] py-[1px] rounded bg-[color-mix(in_oklab,var(--queued)_18%,transparent)] text-[var(--queued)]">
              Experimental
            </span>
          ) : null}
        </div>
        <div className="text-[11px] text-txt-3 mt-[3px] leading-[1.45]">{def.description}</div>
      </div>
      <Switch checked={enabled} disabled={disabled} onChange={onToggle} label={def.label} />
    </div>
  );
}
