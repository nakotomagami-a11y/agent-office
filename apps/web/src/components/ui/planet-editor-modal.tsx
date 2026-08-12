"use client";

import { useEffect, useState, useCallback } from "react";
import type { PlanetConfig, PlanetType } from "@agent-office/domain/types";
import { PLANET_TYPE_DEFS, FREEFORM_TYPES, CANVAS_SCALE, randomPlanet, randomPlanetOfType } from "@/lib/planet-seed";
import { ModalShell } from "./modal-shell";
import { PlanetCanvas } from "./planet-canvas";
import { Icon } from "./icon";
import { ACCENT_BTN } from "@/lib/button-styles";

function rgbToHex(rgb: [number, number, number]): string {
  const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${clamp(rgb[0])}${clamp(rgb[1])}${clamp(rgb[2])}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

interface PlanetEditorModalProps {
  open: boolean;
  projectId: string;
  current?: PlanetConfig;
  onSave: (config: PlanetConfig) => void;
  onClose: () => void;
}

const PLANET_TYPES: PlanetType[] = ["gas-giant", "rocky", "dry", "terran", "ice", "islands", "lava", "black-hole", "galaxy", "star", "asteroid"];

const DEFAULT_PIXELS = 1000;
const PREVIEW_SIZES = [168, 96, 54] as const;
const PREVIEW_LABELS = ["Detail", "List", "Nav"] as const;

function randSeed() {
  return Math.floor(Math.random() * 999999999);
}

export function PlanetEditorModal({
  open,
  projectId,
  current,
  onSave,
  onClose,
}: PlanetEditorModalProps) {
  const withDefaults = (c: PlanetConfig): PlanetConfig => ({
    ...c,
    pixels: c.pixels ?? DEFAULT_PIXELS,
    dither: c.dither ?? true,
  });

  const [draft, setDraft] = useState<PlanetConfig>(
    current ? withDefaults(current) : { type: "gas-giant", seed: randSeed(), paletteIdx: 0, pixels: DEFAULT_PIXELS, dither: true },
  );

  useEffect(() => {
    if (open) {
      setDraft(current ? withDefaults(current) : { type: "gas-giant", seed: randSeed(), paletteIdx: 0, pixels: DEFAULT_PIXELS, dither: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setType = useCallback((type: PlanetType) => {
    const palettes = PLANET_TYPE_DEFS[type].palettes;
    setDraft((d) => ({
      ...d,
      type,
      paletteIdx: Math.min(d.paletteIdx, palettes.length - 1),
      customPalette: undefined,
    }));
  }, []);

  const setPalette = useCallback((idx: number) => {
    setDraft((d) => ({ ...d, paletteIdx: idx, customPalette: undefined }));
  }, []);

  const randomize = useCallback(() => {
    const r = randomPlanetOfType(draft.type);
    setDraft((d) => ({ ...d, seed: r.seed, paletteIdx: r.paletteIdx, customPalette: undefined }));
  }, [draft.type]);

  // Reroll everything — type, seed, palette. Preserves the user's pixels/rotation/dither
  // display prefs so a full reroll doesn't wipe rendering settings.
  const rerollAll = useCallback(() => {
    const r = randomPlanet();
    setDraft((d) => ({
      ...d,
      type: r.type,
      seed: r.seed,
      paletteIdx: r.paletteIdx,
      customPalette: undefined,
    }));
  }, []);

  const handleCustomColor = useCallback((layerIdx: number, colorIdx: number, hex: string) => {
    const rgb = hexToRgb(hex);
    setDraft((d) => {
      const baseLayers = PLANET_TYPE_DEFS[d.type].palettes[d.paletteIdx]?.layers ?? [];
      const current = d.customPalette ?? baseLayers.map((l) => l.map((c) => [...c] as [number, number, number]));
      const next = current.map((layer, li) =>
        li === layerIdx
          ? layer.map((c, ci) => (ci === colorIdx ? rgb : c) as [number, number, number])
          : layer,
      );
      return { ...d, customPalette: next };
    });
  }, []);

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const typeDef = PLANET_TYPE_DEFS[draft.type];
  const rotationDeg = Math.round(((draft.rotation ?? 0) * 180) / Math.PI);
  const dither = draft.dither ?? true;
  const isFreeform = FREEFORM_TYPES.has(draft.type);
  const freeformCls = isFreeform ? "" : "rounded-full overflow-hidden";

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Planet"
      size="md"
      maxWidth={720}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center px-4 py-[7px] rounded-[8px] text-[13px] font-medium text-txt-2 bg-transparent border border-line hover:bg-bg-3 hover:text-txt transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`inline-flex items-center gap-[6px] px-4 py-[7px] rounded-[8px] text-[13px] font-semibold ${ACCENT_BTN} transition-colors cursor-pointer`}
          >
            <Icon name="check" size={13} />
            Save
          </button>
        </>
      }
    >
      <div className="flex gap-[18px]">
        {/* Left: size previews */}
        <div className="shrink-0 flex flex-col items-center gap-[14px] pt-[2px]">
          <div className="text-[9px] font-mono text-txt-3 uppercase tracking-wide">Preview</div>
          {PREVIEW_SIZES.map((sz, i) => {
            const scale = CANVAS_SCALE[draft.type] ?? 1;
            const previewSize = Math.round(sz / scale);
            return (
              <div key={sz} className="flex flex-col items-center gap-[4px]">
                <div className="flex items-center justify-center overflow-hidden" style={{ width: 168, height: sz }}>
                  <PlanetCanvas
                    projectId={`${projectId}-editor`}
                    config={draft}
                    size={previewSize}
                    className={freeformCls}
                  />
                </div>
                <span className="text-[9px] font-mono text-txt-3">{PREVIEW_LABELS[i]}</span>
              </div>
            );
          })}
        </div>

        {/* Right: all controls */}
        <div className="flex-1 min-w-0 flex flex-col gap-[12px]">
          {/* Type name */}
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-[13px] font-bold text-txt leading-tight">{typeDef.label}</div>
              <div className="text-[11px] font-mono text-txt-3 mt-[1px]">
                {typeDef.palettes[draft.paletteIdx]?.name ?? "—"}
              </div>
            </div>
            <div className="flex items-center gap-[4px] shrink-0">
              <button
                type="button"
                onClick={randomize}
                title="Reshuffle seed + palette, keep current type"
                className="inline-flex items-center gap-[5px] px-[8px] py-[4px] rounded-[6px] text-[11px] font-semibold text-txt-2 bg-bg-3 border border-line hover:bg-[rgba(255,255,255,0.06)] hover:text-txt transition-colors cursor-pointer"
              >
                <Icon name="refresh" size={11} />
                Randomize
              </button>
              <button
                type="button"
                onClick={rerollAll}
                title="Reroll type + seed + palette — full random planet"
                className="inline-flex items-center gap-[5px] px-[8px] py-[4px] rounded-[6px] text-[11px] font-semibold text-txt-2 bg-bg-3 border border-line hover:bg-[rgba(255,255,255,0.06)] hover:text-txt transition-colors cursor-pointer"
              >
                <Icon name="sparkle" size={11} />
                Reroll all
              </button>
            </div>
          </div>

          {/* Planet type picker — 4 equal columns via flex-wrap (house rule: no CSS grid). */}
          <div>
            <div className="text-[9px] font-mono text-txt-3 uppercase tracking-wide mb-[5px]">Type</div>
            <div className="flex flex-wrap gap-[4px]">
              {PLANET_TYPES.map((t) => {
                const def = PLANET_TYPE_DEFS[t];
                const selected = draft.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={[
                      "basis-[calc(25%-3px)] flex flex-col items-center gap-[4px] py-[6px] px-[2px] rounded-[8px] border transition-all duration-100 cursor-pointer",
                      selected
                        ? "bg-[rgba(255,120,60,0.10)] border-[rgba(255,120,60,0.45)]"
                        : "bg-bg-2 border-line hover:bg-bg-3 hover:border-line-2",
                    ].join(" ")}
                  >
                    <PlanetCanvas
                      projectId={`${projectId}-type-${t}`}
                      config={{ type: t, seed: draft.seed, paletteIdx: 0, pixels: draft.pixels, dither: draft.dither }}
                      size={28}
                      className={FREEFORM_TYPES.has(t) ? "" : "rounded-full overflow-hidden"}
                    />
                    <span className={[
                      "text-[9px] font-mono leading-[1.2] text-center w-full px-[1px] overflow-hidden",
                      selected ? "text-acc" : "text-txt-2",
                    ].join(" ")}>
                      {def.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Seed */}
          <div className="flex items-center gap-[6px]">
            <label className="text-[9px] font-mono text-txt-3 uppercase tracking-wide shrink-0 w-[40px]">Seed</label>
            <input
              type="number"
              value={draft.seed}
              min={1}
              max={999999999}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) setDraft((d) => ({ ...d, seed: Math.max(1, v) }));
              }}
              className="flex-1 min-w-0 bg-bg-3 border border-line text-txt text-[11px] font-mono rounded-[6px] px-[8px] py-[3px] outline-none focus:border-line-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, seed: randSeed() }))}
              className="shrink-0 inline-flex items-center gap-[4px] px-[7px] py-[3px] rounded-[6px] text-[11px] font-semibold text-txt-2 bg-bg-3 border border-line hover:bg-[rgba(255,255,255,0.06)] hover:text-txt transition-colors cursor-pointer"
            >
              <Icon name="refresh" size={10} />
              Rand
            </button>
          </div>

          {/* Rotation */}
          <div className="flex items-center gap-[6px]">
            <label className="text-[9px] font-mono text-txt-3 uppercase tracking-wide shrink-0 w-[40px]">Rotate</label>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={rotationDeg}
              onChange={(e) => {
                const deg = parseInt(e.target.value, 10);
                setDraft((d) => ({ ...d, rotation: (deg * Math.PI) / 180 }));
              }}
              className="flex-1 h-[3px] accent-[var(--acc)] cursor-pointer"
            />
            <span className="text-[11px] font-mono text-txt-3 w-[36px] text-right">{rotationDeg}°</span>
          </div>

          {/* Dither */}
          <div className="flex items-center gap-[6px]">
            <label className="text-[9px] font-mono text-txt-3 uppercase tracking-wide shrink-0 w-[40px]">Dither</label>
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, dither: !(d.dither ?? true) }))}
              className={[
                "inline-flex items-center gap-[5px] px-[8px] py-[2px] rounded-[5px] text-[11px] font-semibold border transition-colors cursor-pointer",
                dither
                  ? "bg-[rgba(255,120,60,0.15)] border-[rgba(255,120,60,0.45)] text-acc"
                  : "bg-bg-3 border-line text-txt-3 hover:text-txt",
              ].join(" ")}
            >
              {dither ? "ON" : "OFF"}
            </button>
          </div>

          {/* Palette picker — 3 equal columns via flex-wrap (house rule: no CSS grid). */}
          <div>
            <div className="text-[9px] font-mono text-txt-3 uppercase tracking-wide mb-[5px]">Palette</div>
            <div className="flex flex-wrap gap-[4px]">
              {typeDef.palettes.map((palette, idx) => {
                const selected = draft.paletteIdx === idx;
                // For the selected palette apply any custom overrides; others show preset
                const effectiveLayers: [number, number, number][][] = selected && draft.customPalette
                  ? draft.customPalette as [number, number, number][][]
                  : palette.layers as [number, number, number][][];

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPalette(idx)}
                    className={[
                      "basis-[calc((100%-8px)/3)] flex flex-col gap-[6px] px-[8px] py-[7px] rounded-[8px] border transition-all duration-100 cursor-pointer text-left",
                      selected
                        ? "bg-[rgba(255,120,60,0.10)] border-[rgba(255,120,60,0.45)]"
                        : "bg-bg-2 border-line hover:bg-bg-3 hover:border-line-2",
                    ].join(" ")}
                  >
                    {/* Color bar — each color fills an equal slice of the full width */}
                    <div className="flex w-full h-[28px] rounded-[5px] overflow-hidden">
                      {effectiveLayers.map((layer, li) =>
                        layer.map((rgb, ci) => {
                          const hex = rgbToHex(rgb);
                          return (
                            <div
                              key={`${li}-${ci}`}
                              className="relative flex-1"
                              style={{ background: hex }}
                              title={selected ? "Click to change color" : undefined}
                              onClick={selected ? (e) => e.stopPropagation() : undefined}
                            >
                              {selected && (
                                <input
                                  type="color"
                                  value={hex}
                                  onChange={(e) => handleCustomColor(li, ci, e.target.value)}
                                  className="opacity-0 absolute inset-0 w-full h-full cursor-pointer border-none p-0"
                                  aria-label={`Layer ${li + 1} color ${ci + 1}`}
                                />
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                    {/* Palette name */}
                    <span className={["text-[11px] font-semibold leading-tight truncate w-full", selected ? "text-acc" : "text-txt-2"].join(" ")}>
                      {palette.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
