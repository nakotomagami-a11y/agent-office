import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { GRASS_COLOR_LIST, type GrassColor } from "./grass-colors";
import { LAND_SHAPES } from "../derive/land-generator";
import type { useBuildToolbar } from "../hooks/use-build-toolbar";
import { ACC_GRAD, GEN_SHADOW } from "./office-build-toolbar-styles";
import { BiomeThumb, GenSlider, SoonBadge } from "./office-build-toolbar-parts";

type BuildToolbarState = ReturnType<typeof useBuildToolbar>;

// Bottom-sheet popover: biome colour + land generator + (soon) presets.
export function TerrainPopover({
  t,
  grassColor,
  onSelectGrassColor,
}: {
  t: BuildToolbarState;
  grassColor: GrassColor;
  onSelectGrassColor: (c: GrassColor) => void;
}) {
  const {
    terrainOpen, setTerrainOpen, terrainBtnRef, grassColorDef,
    genShape, setGenShape, genSeed, setGenSeed, seedEdited,
    genCoverage, setGenCoverage, genRoughness, setGenRoughness, genRooms, setGenRooms,
    shapeDef, runGenerate,
  } = t;

  return (
    <AnimatePresence>
      {terrainOpen && (
        <>
          <motion.div
            className="absolute inset-0 z-[7]"
            style={{ background: "rgba(0,0,0,0.32)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={() => setTerrainOpen(false)}
            aria-hidden
          />
          <motion.div
            key="terrain-popover"
            role="dialog"
            aria-label="Terrain settings"
            className="absolute left-0 right-0 bottom-0 z-[8] flex flex-col min-h-0 rounded-b-[16px] border-t border-line-2 bg-bg-1 max-h-[calc(100%-128px)]"
            style={{ boxShadow: "0 -10px 44px -14px rgba(0,0,0,0.7)" }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0, transition: { type: "spring", stiffness: 420, damping: 32 } }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.12 } }}
          >
            <div className="flex items-center gap-[9px] px-[15px] py-[11px] shrink-0 border-b border-line">
              <span className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-acc bg-acc-faint" style={{ border: `1px solid color-mix(in srgb, var(--acc) 30%, transparent)` }}>
                <Icon name="settings" size={13} />
              </span>
              <span className="font-semibold text-[13px] text-txt">Terrain</span>
              <button type="button" onClick={() => { setTerrainOpen(false); terrainBtnRef.current?.focus(); }} className="ml-auto w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-txt-2 cursor-pointer hover:bg-bg-3 hover:text-txt transition-colors duration-100" aria-label="Close terrain settings">
                <Icon name="x" size={14} />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-[15px] py-[13px] flex flex-col gap-[15px] [scrollbar-width:thin] [scrollbar-color:var(--bg-3)_transparent]">
              <section className="flex flex-col gap-[9px]">
                <div className="flex items-center gap-[7px] text-[9.5px] font-semibold uppercase tracking-[0.11em] text-txt-2">
                  Biome color
                  {grassColorDef && <span className="text-[11px] font-normal normal-case tracking-normal text-txt">· {grassColorDef.label}</span>}
                </div>
                <div className="flex gap-[6px]">
                  {GRASS_COLOR_LIST.map((c) => {
                    const on = grassColor === c.id;
                    return (
                      <BiomeThumb
                        key={c.id}
                        def={c}
                        onClick={() => onSelectGrassColor(c.id)}
                        ariaLabel={`Island color: ${c.label}`}
                        selected={on}
                        className={`flex-1 h-[42px] rounded-[10px] cursor-pointer relative overflow-hidden transition-[transform,border-color] duration-150 hover:-translate-y-[2px] ${on ? "border-acc after:content-[''] after:absolute after:inset-[3px] after:rounded-[6px] after:border-[1.5px] after:border-white/70" : "border-[1.5px] border-line hover:border-line-2"}`}
                        extraStyle={on ? { borderColor: "var(--acc)", boxShadow: "0 0 0 2px var(--acc-faint), 0 8px 18px -8px color-mix(in srgb, var(--acc) 50%, transparent)" } : undefined}
                      />
                    );
                  })}
                </div>
              </section>

              <section className="flex flex-col gap-[10px]">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.11em] text-txt-2">Generate land</div>
                <div className="flex items-center gap-[7px]">
                  <DropdownMenu
                    className="flex-1 min-w-0"
                    align="start"
                    ariaLabel="Land shape"
                    triggerClassName="w-full !h-[32px] !px-[10px] justify-between bg-bg-0 !text-txt !text-[12px] border !border-line !rounded-[8px] hover:!bg-bg-2"
                    trigger={
                      <>
                        <span className="truncate">{shapeDef.label}</span>
                        <Icon name="chevron" size={14} className="shrink-0 text-txt-3" />
                      </>
                    }
                    items={LAND_SHAPES.map((s) => ({
                      key: s.id,
                      label: s.label,
                      onSelect: () => setGenShape(s.id),
                    }))}
                  />
                  <input
                    type="number"
                    className="w-[70px] shrink-0 bg-bg-0 border border-line text-txt text-[12px] rounded-[8px] px-[9px] py-[7px] outline-none tabular-nums focus:border-[color-mix(in_srgb,var(--acc)_45%,transparent)] focus:shadow-[0_0_0_3px_var(--acc-faint)] transition-[border-color,box-shadow] duration-150"
                    value={genSeed}
                    onChange={(e) => { seedEdited.current = true; setGenSeed(Number(e.target.value) || 0); }}
                    title="Seed"
                    aria-label="Seed"
                  />
                  <button
                    type="button"
                    className="w-[32px] h-[32px] shrink-0 flex items-center justify-center rounded-[8px] bg-bg-0 border border-line text-txt-2 cursor-pointer hover:bg-bg-3 hover:text-txt transition-colors duration-100"
                    onClick={() => { seedEdited.current = true; setGenSeed(Math.floor(Math.random() * 100000)); }}
                    title="Randomize seed"
                    aria-label="Randomize seed"
                  >
                    <Icon name="refresh" size={13} />
                  </button>
                </div>
                <GenSlider label="Coverage" value={genCoverage} onChange={setGenCoverage} />
                <GenSlider label="Roughness" value={genRoughness} onChange={setGenRoughness} />
                {shapeDef.rooms && (
                  <GenSlider
                    label={genShape === "archipelago" ? "Islands" : "Rooms"}
                    value={genRooms}
                    min={2}
                    max={8}
                    step={1}
                    format={(v) => String(v)}
                    onChange={setGenRooms}
                  />
                )}
                <button
                  type="button"
                  className="mt-[1px] inline-flex items-center justify-center gap-[7px] w-full py-[10px] rounded-[10px] text-white font-semibold text-[12.5px] cursor-pointer transition-[filter,transform] duration-150 hover:brightness-[1.08] active:translate-y-[1px]"
                  style={{ background: ACC_GRAD, boxShadow: GEN_SHADOW }}
                  onClick={runGenerate}
                >
                  <Icon name="sparkle" size={13} />
                  Generate
                </button>
              </section>

              <section className="flex flex-col gap-[9px]">
                <div className="flex items-center gap-[7px] text-[9.5px] font-semibold uppercase tracking-[0.11em] text-txt-2">Presets <SoonBadge /></div>
                <div className="flex flex-wrap gap-[6px]">
                  {["Cozy isle", "Big continent", "Dungeon"].map((name) => (
                    <span key={name} className="inline-flex items-center gap-[6px] px-[10px] py-[6px] rounded-full font-mono text-[10.5px] text-txt-3 bg-bg-2 border border-dashed border-line-2 cursor-not-allowed" title="Saved presets — coming soon" aria-disabled>
                      <Icon name="bookmark" size={11} />
                      {name}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-[6px] px-[10px] py-[6px] rounded-full font-mono text-[10.5px] text-txt-3 bg-bg-2 border border-dashed border-line-2 cursor-not-allowed" title="Save current terrain as a preset — coming soon" aria-disabled>
                    <Icon name="plus" size={11} />
                    Save current
                  </span>
                </div>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
