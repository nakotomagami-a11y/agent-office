import type { MutableRefObject } from "react";
import { AnimatedSprite, Assets, Container, Rectangle, Sprite, Text, Texture } from "pixi.js";
import { TILE, type AgentPositions } from "../components/office-map";
import type { DecorationsMap } from "../components/decorations";
import {
  UNIT_DEFS,
  unitSheetSrc,
  type UnitSheetState,
} from "@/components/ui/unit-sprite-registry";
import { getAgentActionAndFlip, isBridgeCell } from "../derive/agent-action";
import type { OfficeAgent } from "../hooks/use-office-agents";
import type { AgentInstance } from "@agent-office/domain/types";
import { AGENT_SIZE, UNIT_ANIM_SPEED } from "./constants";
import { makeGlow, type AgentContainerExtras } from "./glow";

/** Resolve the action label to the sheet state string, falling back to "idle". */
function getSheetState(
  action: "idle" | "axe" | "pickaxe" | "knife" | "hammer",
  def: (typeof UNIT_DEFS)[keyof typeof UNIT_DEFS],
): UnitSheetState {
  if (action === "axe" && def.axe) return "axe";
  if (action === "hammer" && def.hammer) return "hammer";
  if (action === "pickaxe" && def.pickaxe) return "pickaxe";
  if (action === "knife" && def.knife) return "knife";
  return "idle";
}

// Builds one Container per placed agent into `agentLayer`. Async because unit
// sheets load on demand; `gen`/`genRef` let a superseded build bail after await.
export async function buildAgentLayer(
  agentLayer: Container,
  agentPositions: AgentPositions,
  agentsById: Map<string, OfficeAgent>,
  grid: boolean[][],
  decorations: DecorationsMap,
  isMultiInstance: boolean,
  rosterInstances: AgentInstance[],
  spendByInstance: Record<string, number>,
  gen: number,
  genRef: MutableRefObject<number>,
): Promise<void> {
  // Destroy previous agent containers
  for (const child of agentLayer.removeChildren()) {
    (child as Container).destroy({ children: true });
  }

  // ── Pre-compute instance index map (mirrors office-map.tsx logic) ──────────
  const instanceIndexMap = new Map<string, number>();
  if (isMultiInstance && rosterInstances.length > 0) {
    const seenByAgent = new Map<string, number>();
    for (const inst of rosterInstances) {
      const prev = seenByAgent.get(inst.agentId) ?? 0;
      const idx = prev + 1;
      seenByAgent.set(inst.agentId, idx);
      instanceIndexMap.set(inst.instanceId, idx);
    }
  }

  // ── Collect all needed unit sheet URLs ─────────────────────────────────────
  const neededUrls = new Set<string>();
  for (const [key, ref] of Object.entries(agentPositions)) {
    const agent = agentsById.get(ref.agentId);
    if (!agent) continue;
    const { faction, kind } = agent.unitChoice;
    const def = UNIT_DEFS[kind];
    const [xs, ys] = key.split(",");
    const x = Number(xs);
    const y = Number(ys);
    const isWorking = agent.status === "working" || agent.status === "thinking";
    const { action } = getAgentActionAndFlip(x, y, isWorking, kind, decorations);
    const state = getSheetState(action, def);
    neededUrls.add(unitSheetSrc(faction, kind, state));
    neededUrls.add(unitSheetSrc(faction, kind, "idle"));
    // Pawn action sheets only exist for the black faction; preload them so
    // non-black pawns can fall back to them during working animations.
    if (kind === "pawn" && state !== "idle") {
      neededUrls.add(unitSheetSrc("black", "pawn", state));
    }
  }

  await Promise.all(
    [...neededUrls].map((url) =>
      Assets.load<Texture>(url)
        .then((tex) => { tex.source.scaleMode = "nearest"; })
        .catch(() => { /* silently skip missing sheets */ }),
    ),
  );

  // Stale-call guard
  if (gen !== genRef.current) return;

  // ── Sort agents by y so lower rows draw on top ─────────────────────────────
  const sortedEntries = Object.entries(agentPositions)
    .map(([key, ref]) => {
      const [xs, ys] = key.split(",");
      return { x: Number(xs), y: Number(ys), ref };
    })
    .sort((a, b) => (a.ref.z ?? 0) - (b.ref.z ?? 0) || a.y - b.y);

  // Feet Y target: world pixels below a tile's top edge where all units'
  // ground contact should land. Sits 10% of a tile above the cell's bottom
  // edge (the decoration ground line) so agents read as standing on the tile.
  const TARGET_FEET_Y = TILE * 0.9;

  // ── Build a Container per agent ────────────────────────────────────────────
  for (const { x, y, ref } of sortedEntries) {
    const agent = agentsById.get(ref.agentId);
    if (!agent) continue;

    const { faction, kind } = agent.unitChoice;
    const def = UNIT_DEFS[kind];
    const isWorking = agent.status === "working" || agent.status === "thinking";
    const { action, flip: autoFlip } = getAgentActionAndFlip(x, y, isWorking, kind, decorations);
    // Manual mirror (select tool) toggles the auto-derived facing.
    const flip = autoFlip !== (ref.flip ?? false);
    const state = getSheetState(action, def);

    // Resolve texture. For pawn action sheets that only exist for black faction,
    // fall back to black/pawn/<state> before giving up and using idle.
    let sheetUrl = unitSheetSrc(faction, kind, state);
    let sheetTex: Texture | null = Assets.get<Texture>(sheetUrl) ?? null;
    if (!sheetTex && state !== "idle" && kind === "pawn") {
      sheetUrl = unitSheetSrc("black", "pawn", state);
      sheetTex = Assets.get<Texture>(sheetUrl) ?? null;
    }
    if (!sheetTex && state !== "idle") {
      sheetUrl = unitSheetSrc(faction, kind, "idle");
      sheetTex = Assets.get<Texture>(sheetUrl) ?? null;
    }
    if (!sheetTex) continue;

    // Determine which frame count to use (getSheetState never returns "run")
    const frameCount =
      state === "idle"    ? def.idle.frames
      : state === "axe"     ? (def.axe?.frames    ?? def.idle.frames)
      : state === "hammer"  ? (def.hammer?.frames  ?? def.idle.frames)
      : state === "pickaxe" ? (def.pickaxe?.frames ?? def.idle.frames)
      : state === "knife"   ? (def.knife?.frames   ?? def.idle.frames)
      : def.idle.frames;

    // Slice the horizontal strip into individual frame textures
    const frameTextures: Texture[] = Array.from({ length: frameCount }, (_, i) =>
      new Texture({
        source: sheetTex!.source,
        frame: new Rectangle(i * def.frameW, 0, def.frameW, def.frameH),
      }),
    );

    // Per-unit canvas size: lancers have a tall bbox due to the spear so
    // we scale up their container to match visual weight with other units.
    const agentSize = Math.round(AGENT_SIZE * (def.sizeMultiplier ?? 1));

    // ── Sprite math: scale bbox to agentSize ───────────────────────────────
    const spriteScale = agentSize / Math.max(def.bbox.w, def.bbox.h);
    const padX = (agentSize - def.bbox.w * spriteScale) / 2;
    const padY = (agentSize - def.bbox.h * spriteScale) / 2;
    const spriteX = padX - def.bbox.x * spriteScale;
    const spriteY = padY - def.bbox.y * spriteScale;
    // Mirror: when flipping (scale.x = -spriteScale), the pixel at frame-coord fx
    // renders at: container_x = spriteX' + fx * (-spriteScale)
    // To match CSS scaleX(-1) around the agentSize-wide box:
    //   container_x_flipped = agentSize - (spriteX + fx * spriteScale)
    // → spriteX'(flip) = agentSize - spriteX
    const spriteXFlip = agentSize - spriteX;

    // ── Agent position on tile ─────────────────────────────────────────────
    // groundY: native-frame Y of the feet contact point.
    // Falls back to bbox.y + bbox.h for units that don't need it.
    // Lancer: actual boot contact at y=185 (pixel-verified); lance tip
    // swings through the rest of the bbox and must not drive the anchor.
    const groundNativeY = def.groundY ?? (def.bbox.y + def.bbox.h);
    const feetInContainer = spriteY + groundNativeY * spriteScale;

    const onBridge = isBridgeCell(x, y, grid, decorations);
    const agentLeft = x * TILE + (TILE - agentSize) / 2 + (ref.dx ?? 0);
    const agentTop =
      y * TILE + TARGET_FEET_Y - feetInContainer - (onBridge ? Math.round(TILE * 0.35) : 0) + (ref.dy ?? 0);

    // Container at the tile position; AnimatedSprite inside with the offset
    const agentContainer = new Container();
    agentContainer.x = agentLeft;
    agentContainer.y = agentTop;

    const animSprite = new AnimatedSprite(frameTextures);
    animSprite.scale.set(flip ? -spriteScale : spriteScale, spriteScale);
    animSprite.x = flip ? spriteXFlip : spriteX;
    animSprite.y = spriteY;
    animSprite.animationSpeed = UNIT_ANIM_SPEED;
    animSprite.play();

    // Hover glow: recoloured, blurred silhouette behind the sprite (hidden until
    // hovered). Shares the main sprite's transform; texture is synced to the
    // current animation frame by the hover effect while active.
    const glow = new Sprite(frameTextures[animSprite.currentFrame] ?? frameTextures[0]);
    glow.scale.set(flip ? -spriteScale : spriteScale, spriteScale);
    glow.x = flip ? spriteXFlip : spriteX;
    glow.y = spriteY;
    const glowFx = makeGlow();
    glow.filters = glowFx.filters;
    glow.visible = false;
    agentContainer.addChild(glow);
    agentContainer.addChild(animSprite);
    agentContainer.label = `${x},${y}`;
    const extras = agentContainer as Container & AgentContainerExtras;
    extras.__glow = glow;
    extras.__main = animSprite;
    extras.__cm = glowFx.cm;
    extras.__name = agent.name.toLowerCase();

    // ── Instance badge & spend pill ────────────────────────────────────────
    const instanceIdx = ref.instanceId
      ? instanceIndexMap.get(ref.instanceId)
      : undefined;
    const showBadge = isMultiInstance && instanceIdx !== undefined && instanceIdx > 1;
    if (showBadge) {
      const badge = new Text({
        text: `#${instanceIdx}`,
        style: {
          fill: 0xf4efe8,
          fontSize: 9,
          fontFamily: "monospace",
          fontWeight: "600",
        },
      });
      // anchor(1,1) = bottom-right corner of the text is positioned at (x,y)
      // so we don't need the pre-render width/height (which would be 0 before
      // the first render pass in PixiJS v8's lazy-render model)
      badge.anchor.set(1, 1);
      badge.x = agentSize - 2;
      badge.y = agentSize - 2;
      agentContainer.addChild(badge);
    }

    const spendKey = ref.instanceId ? `${ref.agentId}|${ref.instanceId}` : null;
    const instSpend = spendKey ? (spendByInstance[spendKey] ?? 0) : 0;
    if (isMultiInstance && instSpend > 0) {
      const pill = new Text({
        text: `$${instSpend.toFixed(2)}`,
        style: {
          fill: 0x88cc88,
          fontSize: 9,
          fontFamily: "monospace",
          fontWeight: "600",
        },
      });
      pill.anchor.set(1, 1);
      pill.x = agentSize - 2;
      pill.y = showBadge ? agentSize - 14 : agentSize - 2;
      agentContainer.addChild(pill);
    }

    // Search highlight (dim non-matches + red glow) is applied per frame by the
    // glow ticker via __name, so it doesn't rebuild the scene on each keystroke.

    agentLayer.addChild(agentContainer);
  }
}
