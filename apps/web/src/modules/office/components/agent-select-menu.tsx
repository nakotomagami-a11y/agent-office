import { Icon } from "@/components/ui/icon";
import { MoveControl } from "./move-control";

/**
 * Select-tool menu for a placed agent — mirror, move (nudge), draw-order
 * (layer). Mirrors DecoSelectMenu but agents have no rotation/colour/delete
 * here (delete is the erase tool).
 */
export function AgentSelectMenu({
  name,
  flip,
  z,
  left,
  top,
  onMirror,
  moveMode,
  onMoveMode,
  onReset,
  onForward,
  onBackward,
  onClose,
}: {
  name: string;
  flip: boolean;
  z: number;
  left: number;
  top: number;
  onMirror: () => void;
  moveMode: "tile" | "pixel";
  onMoveMode: (m: "tile" | "pixel") => void;
  onReset: () => void;
  onForward: () => void;
  onBackward: () => void;
  onClose: () => void;
}) {
  const step =
    "w-[22px] h-[22px] flex items-center justify-center rounded-[5px] cursor-pointer text-txt-2 transition-[background,color] duration-100 hover:bg-bg-3 hover:text-txt";

  return (
    <div
      className="absolute z-[11] pointer-events-auto w-[184px] flex flex-col py-[4px] surface-sheen rounded-[14px] shadow-[var(--lift)] overflow-hidden"
      style={{ left, top: top - 12, transform: "translate(-50%, -100%)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pl-[10px] pr-[6px] pb-[3px]">
        <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-txt-4 truncate">
          {name}
        </span>
        <button
          type="button"
          className="shrink-0 w-[20px] h-[20px] flex items-center justify-center rounded-[5px] text-txt-3 cursor-pointer transition-[background,color] duration-100 hover:bg-bg-3 hover:text-txt"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
        >
          <Icon name="x" size={11} />
        </button>
      </div>

      <button
        type="button"
        className={`w-full flex items-center gap-[9px] px-[10px] py-[6px] text-left text-[12px] transition-[background,color] duration-100 hover:bg-bg-3 hover:text-txt ${flip ? "text-amber" : "text-txt-2"}`}
        onClick={onMirror}
      >
        <span className="w-[13px] text-center text-[14px] leading-none">⇋</span>
        Mirror
        <span className="ml-auto font-mono text-[10px] text-txt-4">M</span>
      </button>

      <MoveControl mode={moveMode} onMode={onMoveMode} onReset={onReset} />

      <div className="w-full flex items-center gap-[9px] px-[10px] py-[5px] text-[12px] text-txt-2">
        <Icon name="layers" size={13} />
        Layer
        <span className="ml-auto flex items-center gap-[4px]">
          <button type="button" className={step} onClick={onBackward} title="Send backward" aria-label="Send backward">
            <Icon name="minus" size={12} />
          </button>
          <span className="min-w-[22px] text-center font-mono text-[11px] text-txt-3">{z}</span>
          <button type="button" className={step} onClick={onForward} title="Bring forward" aria-label="Bring forward">
            <Icon name="plus" size={12} />
          </button>
        </span>
      </div>
    </div>
  );
}
