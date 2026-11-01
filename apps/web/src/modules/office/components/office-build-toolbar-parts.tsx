import type { CSSProperties } from "react";
import { Icon } from "@/components/ui/icon";
import type { DecoCategory, DecorationDef } from "./decorations";
import { type GrassColorDef } from "./grass-colors";
import type { BuildTool } from "./office-build-toolbar";

export type IconName = Parameters<typeof Icon>[0]["name"];

export const CATEGORY_TABS: { id: DecoCategory; label: string }[] = [
  { id: "land", label: "Land" },
  { id: "levels", label: "Levels" },
  { id: "paths", label: "Paths" },
  { id: "buildings", label: "Buildings" },
  { id: "animals", label: "Animals" },
  { id: "water", label: "Water" },
];

export const TOOLS: { id: BuildTool; icon: IconName; label: string; key: string; title: string }[] = [
  { id: "select", icon: "cursor", label: "select", key: "V", title: "Select — rotate/mirror/move a placed decoration (V)" },
  { id: "grass", icon: "pen", label: "paint", key: "B", title: "Paint terrain (B)" },
  { id: "erase", icon: "trash", label: "erase", key: "E", title: "Erase (E)" },
  { id: "fill", icon: "paint-bucket", label: "fill", key: "F", title: "Flood fill (F)" },
];

// Presentational pieces of the build toolbar — pure markup, no state.

export function SoonBadge() {
  return <span className="inline-flex items-center text-[8px] font-bold uppercase tracking-[0.04em] px-[5px] py-[1px] rounded-[5px] bg-acc-faint text-acc">soon</span>;
}

export function GenSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format = (v: number) => `${Math.round(v * 100)}%`,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <label className="flex items-center gap-[10px]">
      <span className="w-[62px] shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-txt-2">{label}</span>
      <input
        type="range"
        className="flex-1 h-[5px] cursor-pointer accent-[var(--acc)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-[34px] shrink-0 text-right font-mono text-[11px] tabular-nums text-txt">{format(value)}</span>
    </label>
  );
}

export function DecoSprite({ def, size }: { def: DecorationDef; size: number }) {
  const scale = Math.min(size / def.frameW, size / def.frameH);
  const drawW = def.frameW * scale;
  const drawH = def.frameH * scale;
  const sheetW = def.sheetW ?? def.frameW * def.frames;
  const sheetH = def.sheetH ?? def.frameH;
  const srcX = (def.previewCol ?? 0) * def.frameW;
  const srcY = (def.previewRow ?? 0) * (def.previewRowH ?? def.frameH);
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width: drawW,
        height: drawH,
        backgroundImage: `url(${def.src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${sheetW * scale}px ${sheetH * scale}px`,
        backgroundPosition: `-${srcX * scale}px -${srcY * scale}px`,
        imageRendering: "pixelated",
        flexShrink: 0,
      }}
    />
  );
}

/** Grass tileset preview — a single interior tile fills the element. */
export function BiomeThumb({
  def,
  size,
  className,
  onClick,
  ariaLabel,
  selected,
  extraStyle,
}: {
  def: GrassColorDef;
  size?: number;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  selected?: boolean;
  extraStyle?: CSSProperties;
}) {
  const style: CSSProperties = {
    backgroundImage: `url(${def.src})`,
    backgroundSize: "900% 600%",
    backgroundPosition: "12.5% 20%",
    imageRendering: "pixelated",
    ...(size ? { width: size, height: size } : {}),
    ...extraStyle,
  };
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={def.label} aria-label={ariaLabel ?? def.label} aria-pressed={selected} className={className} style={style} />
    );
  }
  return <span aria-hidden className={`shrink-0 ${className ?? ""}`} style={style} />;
}
