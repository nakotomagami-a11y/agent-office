"use client";

/**
 * /dev/planet-gallery — dev-only screenshot rig for @agent-office/pixel-planets.
 *
 * Shows every PlanetType at once so seed/palette/rotation/params can be tuned
 * by eye, then screenshotted for the pixel-planets-generator README. State is
 * persisted server-side (via /api/dev/planet-gallery, backed by ui_settings)
 * so it survives across browser sessions/tabs — edit here, then open the same
 * URL with ?export=1 for a clean grid (no chrome) to screenshot from.
 *
 * 404s in production (see the API route's forbidInProd gate) — this never
 * ships as a real feature, it's a tool for producing static preview assets.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import type { PlanetConfig, PlanetType } from "@agent-office/domain/types";
import { PLANET_TYPE_DEFS, FREEFORM_TYPES, CANVAS_SCALE } from "@/lib/planet-seed";
import { PlanetCanvas } from "@/components/ui/planet-canvas";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { PlanetGalleryCard } from "./planet-gallery-card";

const PLANET_TYPES = Object.keys(PLANET_TYPE_DEFS) as PlanetType[];
const DEFAULT_PIXELS = 1000;

function randSeed() {
  return Math.floor(Math.random() * 999_999_999) + 1;
}

function defaultConfigFor(type: PlanetType): PlanetConfig {
  return { type, seed: randSeed(), paletteIdx: 0, pixels: DEFAULT_PIXELS, dither: true };
}

type ConfigMap = Record<PlanetType, PlanetConfig>;

function mergeWithDefaults(stored: Partial<Record<string, PlanetConfig>>): ConfigMap {
  const merged = {} as ConfigMap;
  for (const type of PLANET_TYPES) {
    const saved = stored[type];
    merged[type] = saved && saved.type === type ? saved : defaultConfigFor(type);
  }
  return merged;
}

export function PlanetGalleryView() {
  const params = useSearchParams();
  const exportMode = params.get("export") === "1";
  const exportSize = Number(params.get("size") ?? 400) || 400;

  const [configs, setConfigs] = useState<ConfigMap | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dev/planet-gallery")
      .then((r) => r.json())
      .then((data: { configs?: Partial<Record<string, PlanetConfig>> }) => {
        if (cancelled) return;
        setConfigs(mergeWithDefaults(data.configs ?? {}));
      })
      .catch(() => {
        if (!cancelled) setConfigs(mergeWithDefaults({}));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced auto-save on every change, skipping the initial hydration write.
  useEffect(() => {
    if (!configs || exportMode) return;
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/dev/planet-gallery", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs }),
      })
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("idle"));
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [configs, exportMode]);

  const updateConfig = useCallback((type: PlanetType, next: PlanetConfig) => {
    setConfigs((prev) => (prev ? { ...prev, [type]: next } : prev));
  }, []);

  if (!configs) {
    return (
      <div data-theme="dark" className="min-h-screen bg-bg flex items-center justify-center">
        <span className="text-txt-3 text-[13px]">Loading…</span>
      </div>
    );
  }

  if (exportMode) {
    return <ExportGrid configs={configs} size={exportSize} />;
  }

  return (
    <div data-theme="dark" className="min-h-screen bg-bg text-txt">
      <header className="sticky top-0 z-10 flex items-center gap-[14px] px-[28px] py-[16px] border-b border-edge bg-bg/95 backdrop-blur">
        <div>
          <div className="text-[16px] font-bold">Planet gallery</div>
          <div className="text-[11.5px] text-txt-4">Dev tool — tune every planet type, then screenshot for the README</div>
        </div>
        <span className="flex-1" />
        <span className="text-[11px] font-mono text-txt-4 min-w-[64px] text-right">
          {saveState === "saving" ? "saving…" : saveState === "saved" ? "saved" : ""}
        </span>
        <a
          href={`/dev/planet-gallery?export=1&size=${exportSize}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-[7px] py-[9px] px-[16px] rounded-[11px] border-none bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white text-[12.5px] font-bold whitespace-nowrap shadow-[0_12px_24px_-12px_rgba(139,123,255,0.75)] transition-transform duration-150 hover:-translate-y-[1px]"
        >
          Export view <Icon name="external-link" size={13} />
        </a>
      </header>

      <div
        className="grid gap-[18px] p-[24px]"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}
      >
        {PLANET_TYPES.map((type) => (
          <PlanetGalleryCard key={type} config={configs[type]} onChange={(next) => updateConfig(type, next)} />
        ))}
      </div>
    </div>
  );
}

function ExportGrid({ configs, size }: { configs: ConfigMap; size: number }) {
  return (
    <div data-theme="dark" className="min-h-screen bg-bg p-[48px] flex flex-wrap gap-[48px]">
      {PLANET_TYPES.map((type) => {
        const isFreeform = FREEFORM_TYPES.has(type);
        return (
          <div key={type} data-planet-export={type} className="flex flex-col items-center gap-[10px]">
            <div style={{ width: size, height: size }} className="flex items-center justify-center">
              <PlanetCanvas
                projectId={`gallery-export-${type}`}
                config={configs[type]}
                size={Math.round(size / (CANVAS_SCALE[type] ?? 1))}
                className={cn("relative", !isFreeform && "rounded-full overflow-hidden")}
              />
            </div>
            <span className="text-[11px] font-mono text-txt-4">{type}</span>
          </div>
        );
      })}
    </div>
  );
}
