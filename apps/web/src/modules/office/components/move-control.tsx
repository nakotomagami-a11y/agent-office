/**
 * Movement mode selector for the selected canvas object. The object is already
 * "active" (selected) — this only picks what the arrow keys do:
 *   - Move  → relocate a whole grid tile per arrow press.
 *   - Nudge → fine pixel offset within the tile (Shift = larger steps).
 * The ⌖ button recentres the object in its tile.
 */
export function MoveControl({
  mode,
  onMode,
  onReset,
}: {
  mode: "tile" | "pixel";
  onMode: (m: "tile" | "pixel") => void;
  onReset: () => void;
}) {
  const seg = (active: boolean) =>
    `flex-1 px-[8px] py-[4px] rounded-[5px] text-[11.5px] cursor-pointer transition-[background,color] duration-100 ${
      active
        ? "bg-[rgba(255,240,230,0.12)] text-[#f4efea]"
        : "text-[rgba(199,191,183,0.75)] hover:text-[#f4efea]"
    }`;

  return (
    <div className="px-[8px] py-[4px] flex flex-col gap-[4px]">
      <div className="flex items-center gap-[4px]">
        <div className="flex-1 flex items-center gap-[2px] bg-[rgba(255,240,230,0.05)] rounded-[6px] p-[2px]">
          <button type="button" className={seg(mode === "tile")} onClick={() => onMode("tile")}>Move</button>
          <button type="button" className={seg(mode === "pixel")} onClick={() => onMode("pixel")}>Nudge</button>
        </div>
        <button
          type="button"
          className="w-[26px] h-[26px] shrink-0 flex items-center justify-center rounded-[5px] cursor-pointer text-[12px] text-[rgba(199,191,183,0.9)] transition-[background,color] duration-100 hover:bg-[rgba(255,240,230,0.1)] hover:text-[#f4efea]"
          onClick={onReset}
          title="Recentre in tile"
          aria-label="Recentre in tile"
        >
          ⌖
        </button>
      </div>
      <div className="text-[10px] text-[rgba(199,191,183,0.4)] px-[2px] flex items-center gap-[4px]">
        <span className="tracking-[0.1em]">← ↑ ↓ →</span>
        {mode === "tile" ? "move by tile" : "nudge · shift = bigger"}
      </div>
    </div>
  );
}
