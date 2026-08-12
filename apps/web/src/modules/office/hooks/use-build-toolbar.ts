"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DECORATIONS,
  DECORATION_KINDS,
  type DecoCategory,
  type DecorationKind,
} from "../components/decorations";
import { GRASS_COLOR_LIST, type GrassColor } from "../components/grass-colors";
import { LAND_SHAPES, type LandShape } from "../derive/land-generator";
import { useFilter } from "@/hooks/use-filter";
import type { BuildTool, LandGenParams } from "../components/office-build-toolbar";

/**
 * All non-JSX state, effects and derived data for the build toolbar. Keeps the
 * component file markup-only (see docs/component-conventions.md): it calls this
 * hook and renders the result.
 */
export function useBuildToolbar(params: {
  active: boolean;
  tool: BuildTool | null;
  grassColor: GrassColor;
  onGenerateLand: (opts: LandGenParams) => void;
}) {
  const { active, tool, grassColor, onGenerateLand } = params;

  const [activeTab, setActiveTab] = useState<DecoCategory>("land");
  const [genShape, setGenShape] = useState<LandShape>("island");
  const [genSeed, setGenSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [genCoverage, setGenCoverage] = useState(0.65);
  const [genRoughness, setGenRoughness] = useState(0.5);
  const [genRooms, setGenRooms] = useState(4);
  const [terrainOpen, setTerrainOpen] = useState(false);
  // UI-only demo state for not-yet-wired affordances (marked "soon").
  const [brush, setBrush] = useState(1);
  const [scatter, setScatter] = useState(false);
  const seedEdited = useRef(false);
  const terrainBtnRef = useRef<HTMLButtonElement>(null);

  const shapeDef = LAND_SHAPES.find((s) => s.id === genShape)!;

  // Generate uses the current seed; a plain repeat re-rolls a fresh one, but a
  // seed the user typed is honoured verbatim (once).
  const runGenerate = () => {
    const seed = seedEdited.current ? genSeed : Math.floor(Math.random() * 100000);
    seedEdited.current = false;
    setGenSeed(seed);
    onGenerateLand({ shape: genShape, seed, coverage: genCoverage, roughness: genRoughness, rooms: genRooms });
  };

  // Selecting a decoration tool switches to its category tab.
  useEffect(() => {
    if (!tool || tool === "grass" || tool === "erase" || tool === "fill" || tool === "select") return;
    const kind = tool as DecorationKind;
    if (DECORATION_KINDS.includes(kind)) setActiveTab(DECORATIONS[kind].category);
  }, [tool]);

  // Esc closes the terrain popover.
  useEffect(() => {
    if (!terrainOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setTerrainOpen(false);
        terrainBtnRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [terrainOpen]);

  // Leaving build mode closes the popover.
  useEffect(() => {
    if (!active) setTerrainOpen(false);
  }, [active]);

  const grassColorDef = GRASS_COLOR_LIST.find((c) => c.id === grassColor);

  const { query: q, setQuery: setQ, filtered: searchResults } = useFilter(
    DECORATION_KINDS,
    (k, s) =>
      DECORATIONS[k].label.toLowerCase().includes(s) ||
      DECORATIONS[k].category.includes(s) ||
      DECORATIONS[k].family.includes(s),
  );

  const filteredKinds = q.trim()
    ? searchResults
    : DECORATION_KINDS.filter((k) => DECORATIONS[k].category === activeTab);

  const searchGroups = useMemo(() => {
    if (!q.trim()) return null;
    const map = new Map<string, DecorationKind[]>();
    for (const k of searchResults) {
      const cat = DECORATIONS[k].category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(k);
    }
    return [...map.entries()] as [string, DecorationKind[]][];
  }, [q, searchResults]);

  const selectedKind = DECORATION_KINDS.includes(tool as DecorationKind)
    ? (tool as DecorationKind)
    : null;
  const selectedDef = selectedKind ? DECORATIONS[selectedKind] : null;
  const paintingTool = tool === "grass" || tool === "erase" || tool === "fill";

  return {
    activeTab, setActiveTab,
    genShape, setGenShape,
    genSeed, setGenSeed,
    genCoverage, setGenCoverage,
    genRoughness, setGenRoughness,
    genRooms, setGenRooms,
    terrainOpen, setTerrainOpen, terrainBtnRef,
    brush, setBrush,
    scatter, setScatter,
    seedEdited,
    shapeDef,
    runGenerate,
    grassColorDef,
    q, setQ,
    filteredKinds,
    searchGroups,
    selectedKind, selectedDef,
    paintingTool,
  };
}
