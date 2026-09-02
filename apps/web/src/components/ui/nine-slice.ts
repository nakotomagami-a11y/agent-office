"use client";

import { useEffect } from "react";

/**
 * Shared engine behind the app's JS nine-slice painters (`PaperPanelPainter`).
 * CSS `border-image` doesn't work here — these are fixed-size sprite sheets,
 * not pre-stitched border images — so instead each
 * target element gets a canvas painted from source corner/edge/middle rects
 * and applied as its `background-image`. Corners/edges are drawn at a fixed
 * pixel size (not scaled to the element), so border weight stays constant
 * across sizes; the middle band repeats horizontally and stretches
 * vertically to fill whatever's left.
 */

export type NineSliceRects = {
  leftX: number;
  midX: number;
  rightX: number;
  edgeW: number; // left & right column art width
  midW: number; // middle column art width
  topY: number;
  topH: number; // top row height
  midY: number;
  midH: number; // middle row height
  botY: number;
  botH: number; // bottom row height
};

export type NineSliceConfig = {
  src: string;
  selector: string;
  rects: NineSliceRects;
  /** Fraction of source cap size drawn on screen; middle absorbs the rest. */
  capScale: number;
  /**
   * Drop the source middle ROW entirely: the top and bottom caps split the
   * full height between them and stretch to meet, instead of a repeating
   * middle band. Useful when the middle row has texture you don't want tiled.
   */
  skipMiddleRow?: boolean;
  /** Called per element instead of painting; return true to skip (e.g. disabled). */
  skip?: (el: HTMLElement) => boolean;
  /** Extra attributes to watch for repaint (e.g. ["disabled", "aria-disabled"]). */
  attributeFilter?: string[];
};

let imgPromiseCache = new Map<string, Promise<HTMLImageElement>>();
function loadSprite(src: string): Promise<HTMLImageElement> {
  let p = imgPromiseCache.get(src);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    imgPromiseCache.set(src, p);
  }
  return p;
}

function paint(el: HTMLElement, img: HTMLImageElement, config: NineSliceConfig) {
  if (config.skip?.(el)) {
    el.style.backgroundImage = "";
    el.dataset.nineSliceKey = "skipped";
    return;
  }

  const { leftX, midX, rightX, edgeW, midW, topY, topH, midY, midH, botY, botH } = config.rects;
  const dpr = window.devicePixelRatio || 1;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (!w || !h) return;

  const key = `${w}x${h}@${dpr}`;
  if (el.dataset.nineSliceKey === key) return;
  el.dataset.nineSliceKey = key;

  const W = Math.round(w * dpr);
  const H = Math.round(h * dpr);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;

  let capW = Math.max(1, Math.round(edgeW * config.capScale));
  let dstTopH: number;
  let dstBotH: number;

  if (config.skipMiddleRow) {
    // No middle band: split the full height between the two caps by their
    // source proportions, so they stretch to meet in the middle.
    dstTopH = Math.max(1, Math.round((H * topH) / (topH + botH)));
    dstBotH = Math.max(1, H - dstTopH);
  } else {
    dstTopH = Math.max(1, Math.round(topH * config.capScale));
    dstBotH = Math.max(1, Math.round(botH * config.capScale));
    // Elements shorter than both caps combined can't fit them — shrink
    // proportionally so they still meet instead of overlapping.
    if (dstTopH + dstBotH > H) {
      const shrink = H / (dstTopH + dstBotH);
      dstTopH = Math.max(1, Math.floor(dstTopH * shrink));
      dstBotH = Math.max(1, H - dstTopH);
    }
  }
  if (capW * 2 > W) capW = Math.max(1, Math.floor(W / 2));

  const dstMidH = Math.max(0, H - dstTopH - dstBotH);
  const midDstY = dstTopH;
  const rightCapX = W - capW;
  const midDstW = Math.max(1, Math.round(midW * config.capScale));

  // Corners: fixed-size top/bottom caps.
  ctx.drawImage(img, leftX, topY, edgeW, topH, 0, 0, capW, dstTopH);
  ctx.drawImage(img, leftX, botY, edgeW, botH, 0, H - dstBotH, capW, dstBotH);
  ctx.drawImage(img, rightX, topY, edgeW, topH, rightCapX, 0, capW, dstTopH);
  ctx.drawImage(img, rightX, botY, edgeW, botH, rightCapX, H - dstBotH, capW, dstBotH);

  // Side caps continue through the middle band.
  if (dstMidH > 0) {
    ctx.drawImage(img, leftX, midY, edgeW, midH, 0, midDstY, capW, dstMidH);
    ctx.drawImage(img, rightX, midY, edgeW, midH, rightCapX, midDstY, capW, dstMidH);
  }

  // Repeat the middle column across the gap for all three rows; clip the
  // last tile from source so it never squishes.
  const end = W - capW;
  for (let x = capW; x < end; ) {
    const dw = Math.min(midDstW, end - x);
    const sw = midW * (dw / midDstW);
    ctx.drawImage(img, midX, topY, sw, topH, x, 0, dw, dstTopH);
    if (dstMidH > 0) ctx.drawImage(img, midX, midY, sw, midH, x, midDstY, dw, dstMidH);
    ctx.drawImage(img, midX, botY, sw, botH, x, H - dstBotH, dw, dstBotH);
    x += dw;
  }

  el.style.backgroundImage = `url(${canvas.toDataURL()})`;
  el.style.backgroundSize = "100% 100%";
  el.style.backgroundRepeat = "no-repeat";
}

/** Mounts observers that paint every element matching `config.selector`, live. */
export function useNineSlicePainter(config: NineSliceConfig) {
  useEffect(() => {
    let alive = true;
    let ro: ResizeObserver | undefined;
    let mo: MutationObserver | undefined;

    loadSprite(config.src)
      .then((img) => {
        if (!alive) return;
        const seen = new WeakSet<Element>();
        ro = new ResizeObserver((entries) => {
          for (const e of entries) paint(e.target as HTMLElement, img, config);
        });
        const attach = (el: Element) => {
          if (seen.has(el)) return;
          seen.add(el);
          ro!.observe(el);
          paint(el as HTMLElement, img, config);
        };
        document.querySelectorAll<HTMLElement>(config.selector).forEach(attach);

        mo = new MutationObserver((muts) => {
          for (const m of muts) {
            if (m.type === "attributes") {
              paint(m.target as HTMLElement, img, config);
              continue;
            }
            m.addedNodes.forEach((n) => {
              if (n.nodeType !== 1) return;
              const el = n as HTMLElement;
              if (el.matches(config.selector)) attach(el);
              el.querySelectorAll<HTMLElement>(config.selector).forEach(attach);
            });
          }
        });
        mo.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: Boolean(config.attributeFilter?.length),
          attributeFilter: config.attributeFilter,
        });
      })
      .catch(() => {});

    return () => {
      alive = false;
      ro?.disconnect();
      mo?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.src, config.selector]);
}
