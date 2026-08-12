import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { DECORATIONS, type DecoCategory, type DecorationDef, type DecorationKind } from "./decorations";
import { type GrassColorDef } from "./grass-colors";
import type { BuildTool } from "./office-build-toolbar";
import { ACC_BORDER, TILE_BASIS, TILE_BG, TILE_BG_SEL, TILE_SHADOW_SEL } from "./office-build-toolbar-styles";

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

export function HeaderBtn({ icon, label, title, onClick, disabled }: { icon: IconName; label: string; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="w-[27px] h-[27px] rounded-[7px] flex items-center justify-center text-txt-2 cursor-pointer transition-colors duration-100 hover:bg-bg-3 hover:text-txt disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-txt-2"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

export function SoonBadge() {
  return <span className="inline-flex items-center text-[8px] font-bold uppercase tracking-[0.04em] px-[5px] py-[1px] rounded-[5px] bg-acc-faint text-acc">soon</span>;
}

export function InspectorChip({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[9.5px] px-[7px] py-[2px] rounded-full bg-bg-3 text-txt-2 border border-line">{children}</span>;
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

export function DecoTileCell({
  kind,
  selected,
  onSelect,
}: {
  kind: DecorationKind;
  selected: boolean;
  onSelect: (k: BuildTool | null) => void;
}) {
  const def = DECORATIONS[kind];
  if (def.locked) {
    return (
      <div
        className="relative flex flex-col items-center justify-end gap-[6px] px-[4px] pt-[11px] pb-[7px] rounded-[12px] border border-line opacity-40 cursor-not-allowed"
        style={{ ...TILE_BASIS, background: TILE_BG }}
        title={`${def.label} · locked`}
        aria-disabled
      >
        <span className="absolute top-[5px] right-[5px] text-txt-3"><Icon name="lock" size={11} /></span>
        <span className="grayscale"><DecoSprite def={def} size={42} /></span>
        <div className="max-w-full text-center overflow-hidden text-ellipsis whitespace-nowrap text-[9.5px] text-txt-3">{def.label}</div>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`group relative flex flex-col items-center justify-end gap-[6px] px-[4px] pt-[11px] pb-[7px] rounded-[12px] border cursor-pointer transition-[transform,border-color] duration-150 hover:-translate-y-[3px] ${selected ? "border-transparent" : "border-line hover:border-line-2"}`}
      style={{
        ...TILE_BASIS,
        background: selected ? TILE_BG_SEL : TILE_BG,
        ...(selected ? { borderColor: ACC_BORDER, boxShadow: TILE_SHADOW_SEL } : {}),
      }}
      onClick={() => onSelect(kind)}
      title={`${def.label} · ${def.terrain}-only`}
      aria-pressed={selected}
    >
      <span className="absolute top-[4px] right-[4px] w-[19px] h-[19px] rounded-[6px] flex items-center justify-center text-txt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-bg-1 hover:!text-acc" title="Pin to favorites — coming soon" aria-hidden>
        <Icon name="pin" size={11} />
      </span>
      <DecoSprite def={def} size={42} />
      <div className={`max-w-full text-center overflow-hidden text-ellipsis whitespace-nowrap text-[9.5px] ${selected ? "text-acc font-semibold" : "text-txt-2"}`}>{def.label}</div>
    </button>
  );
}

export function DecoSprite({ def, size }: { def: DecorationDef; size: number }) {
  const scale = Math.min(size / def.frameW, size / def.frameH);
  const drawW = def.frameW * scale;
  const drawH = def.frameH * scale;
  const sheetW = def.sheetW ?? def.frameW * def.frames;
  const sheetH = def.sheetH ?? def.frameH;
  const srcX = (def.previewCol ?? 0) * def.frameW;
  const srcY = (def.previewRow ?? 0) * def.frameH;
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
