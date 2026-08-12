"use client";

import { cn } from "@/lib/cn";
import { type UnitFaction, type UnitKind, type UnitSelection } from "./unit-sprite-registry";

// Avatar PNG layout (25 files, 5 factions × 5 kinds):
//   Factions: blue(1-5), red(6-10), yellow(11-15), purple(16-20), black(21-25)
//   Kinds within each block: warrior, pawn, archer, monk, lancer
// Both orderings differ from the UNIT_FACTIONS / UNIT_KINDS constants, so we
// use separate arrays here to map the selection to the correct portrait file.
const AVATAR_FACTION_ORDER: UnitFaction[] = ["blue", "red", "yellow", "purple", "black"];
const AVATAR_KIND_ORDER:    UnitKind[]    = ["warrior", "lancer", "archer", "monk", "pawn"];

function slotFor(unit: UnitSelection): number {
  const fi = AVATAR_FACTION_ORDER.indexOf(unit.faction);
  const ki = AVATAR_KIND_ORDER.indexOf(unit.kind);
  if (fi === -1 || ki === -1) return 1;
  return fi * AVATAR_KIND_ORDER.length + ki + 1;
}

function avatarSrc(slot: number): string {
  return `/avatars/${slot.toString().padStart(2, "0")}.png`;
}

export type AgentAvatarProps = {
  /** Same unit selection used by `UnitSprite` so the avatar matches the sprite. */
  unit: UnitSelection;
  /** Square size in CSS pixels. Defaults to 32. */
  size?: number;
  /** Optional accessible label. Decorative by default. */
  label?: string;
  className?: string;
};

/**
 * Static portrait-style avatar from the Tiny Swords Human Avatars set. Picks
 * the portrait that matches the agent's chosen unit faction+kind, so the
 * sidebar bust and the office-floor full-body sprite are always the same
 * character.
 */
export function AgentAvatar({ unit, size = 32, label, className }: AgentAvatarProps) {
  const slot = slotFor(unit);
  const ariaProps = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true };
  return (
    // Pixel-art sprites intentionally use raw <img> to preserve the
    // `image-rendering: pixelated` fidelity — next/image would rasterize
    // them at the wrong resolution and destroy the pixel grid.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarSrc(slot)}
      width={size}
      height={size}
      className={cn("agent-avatar shrink-0 [image-rendering:pixelated] rounded object-cover", className)}
      style={{
        width: size,
        height: size,
      }}
      alt=""
      {...ariaProps}
    />
  );
}
