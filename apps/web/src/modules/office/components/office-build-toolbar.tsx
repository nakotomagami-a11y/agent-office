"use client";

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/ui/icon";
import {
  DECORATIONS,
  DECORATION_KINDS,
  type DecorationKind,
} from "./decorations";
import { type GrassColor } from "./grass-colors";
import { type LandShape } from "../derive/land-generator";
import { useBuildToolbar } from "../hooks/use-build-toolbar";
import {
  ACC_BORDER, ACC_GRAD, GEN_SHADOW, PANEL_SHADOW, THUMB_BG, TOOLWELL_SHADOW, TOOL_ACTIVE_SHADOW,
} from "./office-build-toolbar-styles";
import {
  BiomeThumb, CATEGORY_TABS, DecoSprite, DecoTileCell, HeaderBtn, InspectorChip, SoonBadge, TOOLS,
} from "./office-build-toolbar-parts";
import { TerrainPopover } from "./office-build-toolbar-terrain";

export type BuildTool = "grass" | "erase" | "fill" | "select" | DecorationKind;

export type OfficeBuildToolbarProps = {
  active: boolean;
  tool: BuildTool | null;
  grassColor: GrassColor;
  onToggle: () => void;
  onSelectTool: (next: BuildTool | null) => void;
  onSelectGrassColor: (next: GrassColor) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onGenerateLand: (opts: LandGenParams) => void;
};

export type LandGenParams = {
  shape: LandShape;
  seed: number;
  coverage: number;
  roughness: number;
  rooms: number;
};

export const OfficeBuildToolbar = memo(function OfficeBuildToolbar({
  active,
  tool,
  grassColor,
  onToggle,
  onSelectTool,
  onSelectGrassColor,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  onGenerateLand,
}: OfficeBuildToolbarProps) {
  const t = useBuildToolbar({ active, tool, grassColor, onGenerateLand });
  const {
    activeTab, setActiveTab,
    terrainOpen, setTerrainOpen, terrainBtnRef,
    brush, setBrush,
    scatter, setScatter,
    shapeDef,
    grassColorDef,
    q, setQ,
    filteredKinds,
    searchGroups,
    selectedDef,
    paintingTool,
  } = t;

  const activeToolDef = TOOLS.find((t) => t.id === tool);

  return (
    <AnimatePresence>
      {!active ? (
        <motion.button
          key="build-entry"
          type="button"
          className="build-entry-btn absolute z-[6] right-[14px] bottom-[14px] inline-flex items-center gap-[7px] px-[15px] py-[9px] rounded-[10px] text-[13px] font-semibold text-white cursor-pointer transition-[filter,transform] duration-150 hover:brightness-[1.07] hover:-translate-y-[1px]"
          style={{ background: ACC_GRAD, border: `1px solid ${ACC_BORDER}`, boxShadow: GEN_SHADOW }}
          onClick={onToggle}
          aria-label="Enter build mode"
          initial={{ opacity: 0, scale: 0.85, x: 4, y: 4 }}
          animate={{ opacity: 1, scale: 1, x: 0, y: 0, transition: { type: "spring", stiffness: 300, damping: 26 } }}
          exit={{ opacity: 0, scale: 0.8, x: 4, y: 4, transition: { duration: 0.13, ease: "easeIn" } }}
        >
          <Icon name="hammer" size={13} />
          Build
        </motion.button>
      ) : (
        <motion.div
          key="build-panel"
          className="build-panel absolute flex flex-col min-h-0 overflow-hidden z-[6] right-[14px] top-[14px] bottom-[14px] w-[320px] rounded-[16px] bg-bg-1 border border-line-2"
          style={{ boxShadow: PANEL_SHADOW }}
          initial={{ opacity: 0, scale: 0.94, x: 22 }}
          animate={{ opacity: 1, scale: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 28, delay: 0.16 } }}
          exit={{ opacity: 0, scale: 0.94, x: 22, transition: { duration: 0.13, ease: "easeIn" } }}
        >
          {/* ══ Header ═════════════════════════════════════════════════════ */}
          <div className="shrink-0 px-[15px] pt-[13px] pb-[12px] border-b border-line">
            <div className="flex items-center gap-[11px]">
              <div
                className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0 text-white"
                style={{ background: ACC_GRAD, boxShadow: "0 3px 10px -2px color-mix(in srgb, var(--acc) 55%, transparent)" }}
              >
                <Icon name="hammer" size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[14px] text-txt leading-none">Build</div>
                <div className="text-[10.5px] mt-[3px] font-mono truncate text-txt-2">painting decor</div>
              </div>
              <div className="flex items-center gap-[2px]">
                <HeaderBtn icon="undo" label="Undo" title="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo} />
                <HeaderBtn icon="redo" label="Redo" title="Redo (⌘⇧Z)" onClick={onRedo} disabled={!canRedo} />
                <div className="shrink-0 w-[1px] h-[16px] bg-line-2 mx-[4px]" />
                <button
                  type="button"
                  className="w-[27px] h-[27px] rounded-[7px] flex items-center justify-center text-txt-2 cursor-pointer transition-colors duration-100 hover:text-[#f0663a]"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, #e95420 16%, transparent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  onClick={onReset}
                  title="Reset canvas"
                  aria-label="Reset canvas"
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>

            {/* Tools */}
            <div
              className="flex gap-[4px] mt-[11px] p-[4px] rounded-[12px] bg-bg-0 border border-line"
              style={{ boxShadow: TOOLWELL_SHADOW }}
            >
              {TOOLS.map((t) => {
                const on = tool === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`relative flex-1 flex flex-col items-center gap-[5px] px-[4px] pt-[10px] pb-[8px] rounded-[9px] cursor-pointer transition-[background,color] duration-150 ${on ? "text-white" : "text-txt-2 hover:bg-bg-2 hover:text-txt"}`}
                    style={on ? { background: ACC_GRAD, boxShadow: TOOL_ACTIVE_SHADOW } : undefined}
                    onClick={() => onSelectTool(t.id)}
                    title={t.title}
                    aria-pressed={on}
                  >
                    <Icon name={t.icon} size={17} />
                    <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em]">{t.label}</span>
                    <span className={`absolute top-[4px] right-[5px] font-mono text-[8.5px] ${on ? "text-white/60" : "text-txt-3"}`}>{t.key}</span>
                  </button>
                );
              })}
            </div>

            {/* Terrain summary */}
            <button
              ref={terrainBtnRef}
              type="button"
              className={`mt-[9px] w-full flex items-center gap-[11px] px-[11px] py-[9px] rounded-[12px] border cursor-pointer transition-[background,border-color] duration-150 ${terrainOpen ? "border-transparent" : "bg-bg-2 border-line hover:bg-bg-3 hover:border-line-2"}`}
              style={terrainOpen ? { background: "color-mix(in srgb, var(--acc) 9%, var(--bg-2))", borderColor: ACC_BORDER } : undefined}
              onClick={() => setTerrainOpen((v) => !v)}
              aria-expanded={terrainOpen}
              aria-label="Terrain settings — biome color and land generation"
            >
              {grassColorDef && (
                <BiomeThumb
                  def={grassColorDef}
                  size={34}
                  className="rounded-[8px] border border-line-2"
                  extraStyle={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06), 0 1px 3px rgba(0,0,0,0.35)" }}
                />
              )}
              <span className="flex flex-col items-start min-w-0 leading-tight gap-[2px]">
                <span className="text-[9.5px] font-semibold uppercase tracking-[0.11em] text-txt-2">Terrain</span>
                <span className="text-[12px] text-txt font-medium truncate max-w-[188px]">
                  {grassColorDef?.label ?? "Biome"} <span className="text-txt-3">·</span> {shapeDef.label}
                </span>
              </span>
              <span
                className={`ml-auto shrink-0 transition-transform duration-200 ${terrainOpen ? "rotate-90 text-acc" : "text-txt-2"}`}
              >
                <Icon name="chevron" size={15} />
              </span>
            </button>
          </div>

          {/* ══ Search + tabs ══════════════════════════════════════════════ */}
          <div className="shrink-0 px-[13px] pt-[11px] border-b border-line">
            <div className="flex items-center gap-[9px] px-[11px] py-[8px] rounded-[10px] bg-bg-0 border border-line text-txt-3 focus-within:border-[color-mix(in_srgb,var(--acc)_45%,transparent)] focus-within:shadow-[0_0_0_3px_var(--acc-faint)] transition-[border-color,box-shadow] duration-150">
              <Icon name="search" size={14} />
              <input
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-txt text-[12.5px] placeholder:text-txt-3"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search tiles…"
                aria-label="Search tiles"
              />
              {q && (
                <button type="button" onClick={() => setQ("")} className="flex items-center bg-transparent border-0 cursor-pointer text-txt-2 hover:text-txt !p-0" aria-label="Clear search">
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>
            {!q && (
              <div className="flex items-center gap-[2px] mt-[8px] overflow-x-auto pb-[2px] [scrollbar-width:thin] [scrollbar-color:var(--bg-3)_transparent] [&::-webkit-scrollbar]:h-[5px] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-bg-3 [&::-webkit-scrollbar-track]:bg-transparent" role="tablist" aria-label="Tile categories">
                {CATEGORY_TABS.map(({ id, label }) => {
                  const count = DECORATION_KINDS.filter((k) => DECORATIONS[k].category === id).length;
                  const on = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      className={`relative shrink-0 inline-flex items-center gap-[6px] px-[10px] pt-[8px] pb-[10px] text-[12px] cursor-pointer transition-colors duration-150 ${on ? "text-txt font-semibold after:content-[''] after:absolute after:left-[8px] after:right-[8px] after:bottom-[-1px] after:h-[2px] after:rounded-[2px_2px_0_0] after:bg-acc after:shadow-[0_0_10px_color-mix(in_srgb,var(--acc)_55%,transparent)]" : "text-txt-2 font-medium hover:text-txt"}`}
                      onClick={() => setActiveTab(id)}
                    >
                      {label}
                      <span className={`font-mono text-[9.5px] px-[5px] py-[1px] rounded-full ${on ? "bg-acc-faint text-acc" : "bg-bg-2 text-txt-3"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ══ Palette (scrolls) ══════════════════════════════════════════ */}
          <div className="flex-1 min-h-0 overflow-y-auto px-[13px] py-[12px] [scrollbar-width:thin] [scrollbar-color:var(--bg-3)_transparent]" role="tabpanel">
            {q.trim() ? (
              searchGroups && searchGroups.length > 0 ? (
                <div className="flex flex-col gap-[8px]">
                  {searchGroups.map(([cat, kinds]) => (
                    <div key={cat}>
                      <div className="flex items-center gap-[8px] mb-[8px] text-[9.5px] font-semibold uppercase tracking-[0.11em] text-txt-2 capitalize">
                        {cat}<span className="flex-1 h-px bg-line" />
                      </div>
                      <div className="flex flex-wrap content-start gap-[8px]">
                        {kinds.map((kind) => (
                          <DecoTileCell key={kind} kind={kind} selected={tool === kind} onSelect={onSelectTool} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center px-3 py-8 font-mono text-[12px] text-txt-2">No tiles match &ldquo;{q}&rdquo;</div>
              )
            ) : (
              <div className="flex flex-wrap content-start gap-[8px]">
                {filteredKinds.map((kind) => (
                  <DecoTileCell key={kind} kind={kind} selected={tool === kind} onSelect={onSelectTool} />
                ))}
              </div>
            )}
          </div>

          {/* ══ Inspector ══════════════════════════════════════════════════ */}
          <div className="shrink-0 px-[15px] py-[11px] flex flex-col gap-[10px] border-t border-line" style={{ background: "linear-gradient(180deg, var(--bg-2), var(--bg-1))" }}>
            <div className="flex items-center gap-[12px]">
              <div
                className="w-[44px] h-[44px] rounded-[11px] flex items-center justify-center shrink-0 border border-line"
                style={{ background: THUMB_BG, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}
              >
                {selectedDef ? (
                  <DecoSprite def={selectedDef} size={30} />
                ) : (
                  <span className="text-txt-2"><Icon name={paintingTool ? "pen" : "crosshair"} size={17} /></span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-txt text-[13px] truncate">
                  {selectedDef?.label ?? (paintingTool ? `${activeToolDef?.label ?? "Tool"} mode` : "No selection")}
                </div>
                <div className="mt-[5px] flex items-center gap-[5px]">
                  {selectedDef ? (
                    <>
                      <InspectorChip>{selectedDef.category}</InspectorChip>
                      <InspectorChip>{selectedDef.family}</InspectorChip>
                      <InspectorChip>{selectedDef.terrain}</InspectorChip>
                    </>
                  ) : (
                    <span className="text-[11px] text-txt-2">{paintingTool ? "drag on the canvas to paint" : "pick a tile from the palette"}</span>
                  )}
                </div>
              </div>
            </div>

            {(paintingTool || selectedDef) && (
              <div className="flex flex-wrap items-center gap-[9px] pt-[9px] border-t border-line">
                <span className="inline-flex items-center gap-[6px] text-[9.5px] font-semibold uppercase tracking-[0.06em] text-txt-2">Brush <SoonBadge /></span>
                <div className="flex gap-[2px] p-[2px] rounded-[8px] bg-bg-0 border border-line" role="group" aria-label="Brush size (coming soon)">
                  {[1, 2, 3].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`min-w-[26px] h-[22px] px-[6px] rounded-[6px] font-mono text-[10px] cursor-pointer transition-colors duration-100 ${brush === s ? "text-white" : "text-txt-2 hover:text-txt"}`}
                      style={brush === s ? { background: ACC_GRAD, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28)" } : undefined}
                      onClick={() => setBrush(s)}
                      title={`${s}×${s} brush — coming soon`}
                      aria-pressed={brush === s}
                    >
                      {s}×{s}
                    </button>
                  ))}
                </div>
                {selectedDef && (
                  <button
                    type="button"
                    className={`inline-flex items-center gap-[6px] px-[9px] py-[5px] rounded-[8px] text-[10px] font-semibold uppercase tracking-[0.05em] border cursor-pointer transition-[background,color,border-color] duration-100 ${scatter ? "text-acc bg-acc-faint" : "text-txt-2 bg-bg-0 border-line hover:text-txt"}`}
                    style={scatter ? { borderColor: ACC_BORDER } : undefined}
                    onClick={() => setScatter((v) => !v)}
                    title="Scatter — randomize variant & rotation while painting (coming soon)"
                    aria-pressed={scatter}
                  >
                    <Icon name="sparkle" size={12} />
                    Scatter
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ══ Terrain popover ════════════════════════════════════════════ */}
          <TerrainPopover t={t} grassColor={grassColor} onSelectGrassColor={onSelectGrassColor} />
        </motion.div>
      )}
    </AnimatePresence>
  );
});
