"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
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
import { BiomeThumb, CATEGORY_TABS, DecoSprite, TOOLS } from "./office-build-toolbar-parts";
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
  // Build-mode exit + layout scope — hosted in the top-center banner so the
  // whole build overlay lives in one component (was a separate bottom bar).
  pendingChanges: number;
  onDone: () => void;
  projectId: string | null;
  useCustomMap: boolean;
  enableCustomMap: () => void;
  disableCustomMap: () => void;
};

export type LandGenParams = {
  shape: LandShape;
  seed: number;
  coverage: number;
  roughness: number;
  rooms: number;
};

/** Per-tool hint shown in the build-mode banner (mirrors the mockup). */
const TOOL_HINT: Record<string, string> = {
  select: "click an object to edit it",
  grass: "drag to place tiles",
  erase: "drag to clear tiles",
  fill: "click an area to flood it",
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
  pendingChanges,
  onDone,
  projectId,
  useCustomMap,
  enableCustomMap,
  disableCustomMap,
}: OfficeBuildToolbarProps) {
  const tr = useTranslations("office_build_toolbar");
  const t = useBuildToolbar({ active, tool, grassColor, onGenerateLand });
  const {
    activeTab, setActiveTab,
    terrainOpen, setTerrainOpen, terrainBtnRef,
    grassColorDef, shapeDef,
    q, setQ,
    filteredKinds,
    searchGroups,
  } = t;

  const hint = TOOL_HINT[tool ?? "select"] ?? "click an object to edit it";
  const searchTiles = q.trim() ? (searchGroups ?? []).flatMap(([, kinds]) => kinds) : filteredKinds;

  return (
    <>
      <AnimatePresence>
        {!active && (
          <motion.button
            key="build-entry"
            type="button"
            className="build-entry-btn absolute z-[6] right-[16px] bottom-[16px] inline-flex items-center gap-[8px] px-[20px] py-[12px] rounded-[15px] border-none text-[13.5px] font-bold text-white cursor-pointer bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] shadow-[0_16px_34px_-16px_rgba(139,123,255,0.95)] transition-transform duration-150 hover:-translate-y-[2px]"
            onClick={onToggle}
            aria-label="Enter build mode"
            initial={{ opacity: 0, scale: 0.85, x: 4, y: 4 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0, transition: { type: "spring", stiffness: 300, damping: 26 } }}
            exit={{ opacity: 0, scale: 0.8, x: 4, y: 4, transition: { duration: 0.13, ease: "easeIn" } }}
          >
            <Icon name="hammer" size={15} />
            Build
          </motion.button>
        )}

        {active && (
          <motion.div
            key="build-frame"
            className="absolute inset-0 z-[5] pointer-events-none rounded-[24px]"
            style={{ boxShadow: "inset 0 0 0 2px var(--acc-line)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18 } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          />
        )}

        {/* ── Top-center banner: mode label + hint + undo/redo/reset + Done ── */}
        {active && (
          <motion.div
            key="build-banner"
            className="absolute z-[7] left-1/2 top-[16px] flex items-center gap-[4px] p-[5px] rounded-[16px] surface-sheen shadow-[var(--lift)]"
            initial={{ opacity: 0, y: -10, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%", transition: { type: "spring", stiffness: 300, damping: 28, delay: 0.1 } }}
            exit={{ opacity: 0, y: -10, x: "-50%", transition: { duration: 0.12 } }}
          >
            <span className="flex items-center gap-[8px] pl-[8px] pr-[12px]">
              <span className="w-[7px] h-[7px] rounded-full bg-acc animate-pulse" />
              <span className="text-[12.5px] font-bold whitespace-nowrap">Build mode</span>
              <span className="font-mono text-[10.5px] text-txt-4 whitespace-nowrap">{hint}</span>
            </span>
            <span className="w-[1px] h-[20px] bg-edge" />
            <BannerBtn icon="undo" title="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo} label="Undo" />
            <BannerBtn icon="redo" title="Redo (⌘⇧Z)" onClick={onRedo} disabled={!canRedo} label="Redo" />
            <BannerBtn icon="trash" title="Reset canvas" onClick={onReset} label="Reset canvas" danger />
            <span className="w-[1px] h-[20px] bg-edge" />
            {projectId && (
              <button
                type="button"
                onClick={useCustomMap ? disableCustomMap : enableCustomMap}
                title={useCustomMap ? tr("switch_to_shared") : tr("switch_to_project")}
                className={`flex items-center gap-[6px] px-[11px] py-[7px] rounded-[10px] text-[11.5px] font-semibold whitespace-nowrap cursor-pointer transition-colors duration-150 ${useCustomMap ? "bg-acc-soft text-acc" : "text-txt-3 hover:bg-card-2 hover:text-txt"}`}
              >
                <Icon name="map" size={12} />
                {useCustomMap ? tr("scope_project") : tr("scope_default")}
              </button>
            )}
            <button
              type="button"
              onClick={onDone}
              className="flex items-center gap-[7px] px-[14px] py-[7px] rounded-[11px] border-none bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[12px] font-bold cursor-pointer whitespace-nowrap"
            >
              {pendingChanges > 0 && <span className="w-[6px] h-[6px] rounded-full bg-white/80" />}
              <Icon name="check" size={12} /> Done
            </button>
          </motion.div>
        )}

        {/* ── Left tool well ── */}
        {active && (
          <motion.div
            key="build-tools"
            className="absolute z-[7] left-[16px] top-1/2 flex flex-col gap-[4px] p-[5px] rounded-[16px] surface-sheen shadow-[var(--lift)]"
            initial={{ opacity: 0, x: -12, y: "-50%" }}
            animate={{ opacity: 1, x: 0, y: "-50%", transition: { type: "spring", stiffness: 300, damping: 28, delay: 0.14 } }}
            exit={{ opacity: 0, x: -12, y: "-50%", transition: { duration: 0.12 } }}
          >
            {TOOLS.map((tl) => {
              const on = tool === tl.id;
              return (
                <button
                  key={tl.id}
                  type="button"
                  onClick={() => onSelectTool(tl.id)}
                  title={tl.title}
                  aria-pressed={on}
                  className={`relative w-[38px] h-[38px] flex items-center justify-center rounded-[12px] cursor-pointer transition-colors duration-150 ${on ? "text-white bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))]" : "text-txt-3 hover:bg-card-2 hover:text-txt"}`}
                >
                  <Icon name={tl.icon} size={16} />
                  <span className={`absolute right-[3px] bottom-[2px] font-mono text-[8px] font-bold ${on ? "text-white/70" : "text-txt-4"}`}>{tl.key}</span>
                </button>
              );
            })}
          </motion.div>
        )}

        {/* ── Bottom-center palette dock ── */}
        {active && (
          <motion.div
            key="build-dock"
            className="absolute z-[7] left-1/2 bottom-[16px] w-[760px] max-w-[calc(100%-160px)] rounded-[20px] surface-sheen shadow-[var(--lift)] overflow-hidden"
            initial={{ opacity: 0, y: 14, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%", transition: { type: "spring", stiffness: 300, damping: 28, delay: 0.18 } }}
            exit={{ opacity: 0, y: 14, x: "-50%", transition: { duration: 0.12 } }}
          >
            {/* Header: category pills + terrain + search */}
            <div className="flex items-center gap-[9px] px-[13px] py-[9px] border-b border-edge">
              <div className="flex items-center gap-[2px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {CATEGORY_TABS.map(({ id, label }) => {
                  const count = DECORATION_KINDS.filter((k) => DECORATIONS[k].category === id).length;
                  const on = !q.trim() && activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => { setQ(""); setActiveTab(id); }}
                      className={`flex items-center gap-[6px] px-[12px] py-[6px] rounded-[10px] text-[12px] font-semibold whitespace-nowrap cursor-pointer transition-colors duration-150 ${on ? "bg-acc-soft text-acc" : "text-txt-3 hover:bg-card-2 hover:text-txt"}`}
                    >
                      {label}
                      <span className="font-mono text-[9.5px] opacity-65">{count}</span>
                    </button>
                  );
                })}
              </div>
              <span className="flex-1" />
              <button
                ref={terrainBtnRef}
                type="button"
                onClick={() => setTerrainOpen((v) => !v)}
                aria-expanded={terrainOpen}
                title="Terrain — biome color and land generation"
                className={`flex items-center gap-[8px] pl-[6px] pr-[10px] py-[6px] rounded-[10px] border cursor-pointer transition-colors duration-150 shrink-0 ${terrainOpen ? "bg-acc-soft border-acc-line" : "bg-card-2 border-edge hover:border-edge-2"}`}
              >
                {grassColorDef && <BiomeThumb def={grassColorDef} size={22} className="rounded-[7px] shrink-0" extraStyle={{ boxShadow: "inset 0 0 0 1px var(--edge)" }} />}
                <span className="text-[11.5px] font-medium text-txt whitespace-nowrap max-w-[120px] truncate">
                  {grassColorDef?.label ?? "Biome"} <span className="text-txt-4">·</span> {shapeDef.label}
                </span>
                <Icon name="chevron" size={13} className={`shrink-0 transition-transform duration-150 ${terrainOpen ? "-rotate-90 text-acc" : "text-txt-4"}`} />
              </button>
              <div className="flex items-center gap-[8px] px-[11px] py-[6px] rounded-[10px] bg-card-2 border border-edge shadow-[var(--inset-hi)] shrink-0">
                <Icon name="search" size={11} className="text-txt-4 shrink-0" />
                <input
                  className="w-[120px] bg-transparent border-0 outline-none text-txt text-[11px] placeholder:text-txt-4"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search tiles…"
                  aria-label="Search tiles"
                />
                {q && (
                  <button type="button" onClick={() => setQ("")} className="flex items-center bg-transparent border-0 cursor-pointer text-txt-4 hover:text-txt !p-0" aria-label="Clear search">
                    <Icon name="x" size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Tile row (horizontal scroll) */}
            <div className="flex items-center gap-[8px] px-[13px] py-[11px] overflow-x-auto [scrollbar-width:thin]">
              {searchTiles.length === 0 ? (
                <div className="w-full text-center py-[14px] font-mono text-[12px] text-txt-3">No tiles match &ldquo;{q}&rdquo;</div>
              ) : (
                searchTiles.map((kind) => {
                  const def = DECORATIONS[kind];
                  const on = tool === kind;
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => onSelectTool(kind)}
                      title={`${def.label} · ${def.terrain}-only`}
                      aria-pressed={on}
                      disabled={def.locked}
                      className={`relative shrink-0 w-[60px] flex flex-col items-center gap-[6px] px-[4px] pt-[8px] pb-[7px] rounded-[13px] cursor-pointer transition-transform duration-150 hover:-translate-y-[2px] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${on ? "bg-acc-soft shadow-[0_0_0_1px_var(--acc-line)]" : "bg-card-2"}`}
                    >
                      <span className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shadow-[inset_0_0_0_1px_var(--edge)] overflow-hidden">
                        <DecoSprite def={def} size={28} />
                      </span>
                      <span className={`text-[9.5px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-[54px] ${on ? "text-acc" : "text-txt-2"}`}>{def.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-canvas bottom-sheet — rendered at the scene-root level (not inside
          the small dock) so its `absolute inset-0` backdrop covers the whole
          canvas, matching its original design. */}
      {active && <TerrainPopover t={t} grassColor={grassColor} onSelectGrassColor={onSelectGrassColor} />}
    </>
  );
});

function BannerBtn({ icon, title, onClick, disabled, label, danger }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; onClick: () => void; disabled?: boolean; label: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={`w-[30px] h-[30px] flex items-center justify-center rounded-[10px] text-txt-3 cursor-pointer transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent ${danger ? "hover:bg-red-soft hover:text-red" : "hover:bg-card-2 hover:text-txt"}`}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}
