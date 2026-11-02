import { UnitSprite } from "@/components/ui/unit-sprite";
import type { UnitSelection } from "@/components/ui/unit-sprite-registry";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

const LONE_PAWN: UnitSelection = { faction: "blue", kind: "pawn" };

const COPY = {
  none: ["All quiet in here", "Summon an agent, give it a task, and watch it work here, live."],
  one: ["Your agent is on standby", "Give it a task from the roster and its work streams in here, live."],
  many: ["Your crew is on standby", "Give one a task from the roster and its work streams in here, live."],
} as const;

/** Live runs with nothing running: the project's crew idling (or a lone pawn for an empty roster). */
export function LiveRunsEmpty({ crew, onSummonAnother }: { crew: UnitSelection[]; onSummonAnother: () => void }) {
  const units = crew.length ? crew : [LONE_PAWN];
  const [title, body] = COPY[crew.length === 0 ? "none" : crew.length === 1 ? "one" : "many"];
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-[10px] py-[20px] text-center animate-[lrIn_420ms_cubic-bezier(.2,.8,.2,1)_both]">
      <div aria-hidden className="relative flex items-end justify-center">
        <span className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-[120%] h-[14px] rounded-[50%] bg-[radial-gradient(closest-side,rgba(139,123,255,.28),transparent)]" />
        {units.map((unit, i) => (
          <UnitSprite key={i} unit={unit} size={52} className={cn("relative", i > 0 && "-ml-[14px]")} />
        ))}
      </div>
      <div className="flex flex-col gap-[3px]">
        <p className="m-0 text-[14px] font-semibold text-txt">{title}</p>
        <p className="m-0 text-[12px] text-txt-3 max-w-[280px]">{body}</p>
      </div>
      <button
        type="button"
        onClick={onSummonAnother}
        className="flex items-center gap-[7px] px-[14px] py-[8px] rounded-[11px] border-none bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[12.5px] font-bold cursor-pointer whitespace-nowrap shadow-[0_12px_26px_-12px_rgba(139,123,255,0.8)] transition-transform duration-150 hover:-translate-y-[1px]"
      >
        <Icon name="plus" size={13} /> {crew.length ? "Summon another" : "Summon agent"}
      </button>
    </div>
  );
}
