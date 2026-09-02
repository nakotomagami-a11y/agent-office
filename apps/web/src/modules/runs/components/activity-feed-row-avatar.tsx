import type { PersistedRun } from "@agent-office/domain/types";
import { UnitSprite } from "@/components/ui/unit-sprite";
import { unitForAgent, type UnitSelection } from "@/components/ui/unit-sprite-registry";

const STATUS_TINT: Record<PersistedRun["status"], string> = {
  done: "var(--green)",
  error: "var(--red)",
  running: "var(--acc)",
};

/**
 * Standing sprite on a status-tinted platform — same "ground shadow + glow"
 * idiom as the Agents grid card (`AgentCard`), scaled down for the activity
 * list. Replaces the old 32px portrait crop, which the mockup never used.
 */
export function ActivityFeedRowAvatar({
  run,
  unitByAgent,
}: {
  run: PersistedRun;
  unitByAgent: Map<string, UnitSelection>;
}) {
  const unit = unitByAgent.get(run.agentId) ?? unitForAgent(run.agentName);
  const tint = STATUS_TINT[run.status];

  return (
    <div
      className="relative shrink-0 w-[62px] h-[66px] rounded-[16px] bg-card-2 overflow-hidden flex items-end justify-center"
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 18%, transparent)` }}
    >
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 78%, color-mix(in srgb, ${tint} 20%, transparent), transparent 68%)` }}
      />
      <span
        aria-hidden
        className="absolute bottom-[4px] w-[44px] h-[10px] rounded-full"
        style={{ background: "radial-gradient(rgba(0,0,0,.45), transparent 70%)" }}
      />
      <UnitSprite unit={unit} size={50} animate={false} className="relative mb-[4px]" />
    </div>
  );
}
