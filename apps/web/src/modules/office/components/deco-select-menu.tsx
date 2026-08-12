import { Icon } from "@/components/ui/icon";
import { MoveControl } from "./move-control";
import {
  BUILDING_COLORS,
  COLOR_HEX,
  type BuildingColor,
  type DecorationDef,
  type DecoInstance,
} from "./decorations";

/**
 * The single selection menu for a placed decoration. Replaces the trio of
 * overlapping icon popovers that used to float above a selected sprite. Renders
 * as one dropdown panel anchored above the sprite (screen space, fixed size).
 */
export function DecoSelectMenu({
  def,
  inst,
  left,
  top,
  onRotate,
  onMirror,
  moveMode,
  onMoveMode,
  onReset,
  onColor,
  onForward,
  onBackward,
  onDelete,
  onClose,
}: {
  def: DecorationDef;
  inst: DecoInstance;
  left: number;
  top: number;
  onRotate: () => void;
  onMirror: () => void;
  moveMode: "tile" | "pixel";
  onMoveMode: (m: "tile" | "pixel") => void;
  onReset: () => void;
  onColor: (color: BuildingColor) => void;
  onForward: () => void;
  onBackward: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const activeColor: BuildingColor = inst.color ?? "blue";
  const row =
    "w-full flex items-center gap-[9px] px-[10px] py-[6px] text-left text-[12px] text-[rgba(199,191,183,0.92)] cursor-pointer transition-[background,color] duration-100 hover:bg-[rgba(255,240,230,0.08)] hover:text-[#f4efea]";
  const shortcut = "ml-auto font-mono text-[10px] text-[rgba(199,191,183,0.4)]";

  return (
    <div
      className="absolute z-[11] pointer-events-auto w-[184px] flex flex-col py-[4px] bg-[rgba(20,16,14,0.98)] border border-[rgba(255,240,230,0.14)] rounded-[10px] shadow-[var(--shadow-2)] overflow-hidden"
      style={{ left, top: top - 12, transform: "translate(-50%, -100%)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pl-[10px] pr-[6px] pb-[3px]">
        <span className="text-[10px] font-medium uppercase tracking-[0.07em] text-[rgba(199,191,183,0.45)] truncate">
          {def.label}
        </span>
        <button
          type="button"
          className="shrink-0 w-[20px] h-[20px] flex items-center justify-center rounded-[5px] text-[rgba(199,191,183,0.7)] cursor-pointer transition-[background,color] duration-100 hover:bg-[rgba(255,240,230,0.08)] hover:text-[#f4efea]"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
        >
          <Icon name="x" size={11} />
        </button>
      </div>

      {def.rotFrames && (
        <button type="button" className={row} onClick={onRotate}>
          <Icon name="refresh" size={13} />
          Rotate
          <span className={shortcut}>R</span>
        </button>
      )}
      <button type="button" className={row} onClick={onMirror}>
        <span className="w-[13px] text-center text-[14px] leading-none">⇋</span>
        Mirror
        <span className={shortcut}>M</span>
      </button>

      <MoveControl mode={moveMode} onMode={onMoveMode} onReset={onReset} />

      <div className="w-full flex items-center gap-[9px] px-[10px] py-[5px] text-[12px] text-[rgba(199,191,183,0.92)]">
        <Icon name="layers" size={13} />
        Layer
        <span className="ml-auto flex items-center gap-[4px]">
          <button
            type="button"
            className="w-[22px] h-[22px] flex items-center justify-center rounded-[5px] cursor-pointer text-[rgba(199,191,183,0.9)] transition-[background,color] duration-100 hover:bg-[rgba(255,240,230,0.1)] hover:text-[#f4efea]"
            onClick={onBackward}
            title="Send backward"
            aria-label="Send backward"
          >
            <Icon name="minus" size={12} />
          </button>
          <span className="min-w-[22px] text-center font-mono text-[11px] text-[rgba(199,191,183,0.7)]">
            {inst.z ?? 0}
          </span>
          <button
            type="button"
            className="w-[22px] h-[22px] flex items-center justify-center rounded-[5px] cursor-pointer text-[rgba(199,191,183,0.9)] transition-[background,color] duration-100 hover:bg-[rgba(255,240,230,0.1)] hover:text-[#f4efea]"
            onClick={onForward}
            title="Bring forward"
            aria-label="Bring forward"
          >
            <Icon name="plus" size={12} />
          </button>
        </span>
      </div>

      {def.colorable && (
        <>
          <div className="h-[1px] my-[4px] mx-[10px] bg-[rgba(255,240,230,0.1)]" />
          <div className="flex items-center gap-[7px] px-[10px] py-[3px]">
            {(def.colors ? def.colors.map((id) => ({ id, hex: COLOR_HEX[id] })) : BUILDING_COLORS).map(({ id, hex }) => {
              const active = id === activeColor;
              return (
                <button
                  key={id}
                  type="button"
                  className={`w-[20px] h-[20px] rounded-full cursor-pointer transition-transform duration-100 hover:scale-110 ${active ? "ring-2 ring-[#f4efea] ring-offset-2 ring-offset-[rgba(20,16,14,0.98)]" : "ring-1 ring-[rgba(255,240,230,0.15)]"}`}
                  style={{ backgroundColor: hex }}
                  onClick={() => onColor(id)}
                  title={id[0]!.toUpperCase() + id.slice(1)}
                  aria-label={`Colour ${id}`}
                  aria-pressed={active}
                />
              );
            })}
          </div>
        </>
      )}

      <div className="h-[1px] my-[4px] mx-[10px] bg-[rgba(255,240,230,0.1)]" />
      <button
        type="button"
        className="w-full flex items-center gap-[9px] px-[10px] py-[6px] text-left text-[12px] text-[rgba(199,191,183,0.85)] cursor-pointer transition-[background,color] duration-100 hover:bg-[rgba(233,84,32,0.14)] hover:text-[#e95420]"
        onClick={onDelete}
      >
        <Icon name="trash" size={13} />
        Delete
        <span className={shortcut}>Del</span>
      </button>
    </div>
  );
}
