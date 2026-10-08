"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { GeneratedImageRef } from "@agent-office/domain/config/generated-images";
import type { ImggenJob } from "../format/imggen-command";
import { imageJobWindow } from "../format/image-job-window";
import { useGeneratedImages } from "../hooks/use-generated-images";
import { InlineImage, ShownImagesContext } from "./inline-image";

/** Slot i of the job: by seed when seeds are known, else in write order. */
function slotImages(job: ImggenJob, found: GeneratedImageRef[]): Array<GeneratedImageRef | undefined> {
  return Array.from({ length: job.count }, (_, i) =>
    job.seeds ? found.find((f) => f.seed === job.seeds![i]) : found[job.offset + i],
  );
}

/** Polling, the final catch-up fetch, and registering what's shown for dedupe. */
function useImageJob(job: ImggenJob, ts: number, doneTs: number | undefined, turnLive: boolean) {
  const now = Date.now();
  const { untilMs, live, deadline } = imageJobWindow(job, ts, doneTs, turnLive, now);
  const backgroundLive = deadline !== undefined && now < deadline;
  const { data, isError, isFetched, isFetching, refetch } = useGeneratedImages(job, ts, untilMs, live);

  // The last image can land between the final poll and the job ending.
  const wasLive = useRef(live);
  useEffect(() => {
    if (wasLive.current && !live) void refetch();
    wasLive.current = live;
  }, [live, refetch]);

  // Nothing else re-renders this card when a background job's window closes.
  const [, expire] = useState(0);
  useEffect(() => {
    if (!backgroundLive) return;
    const timer = setTimeout(() => expire(1), deadline! - Date.now() + 50);
    return () => clearTimeout(timer);
  }, [backgroundLive, deadline]);

  const slots = slotImages(job, data ?? []);
  const urls = slots.flatMap((img) => (img ? [API_ROUTES.generatedImage(img.date, img.filename)] : []));
  const shown = useContext(ShownImagesContext);
  const urlKey = urls.join("\n");
  useEffect(() => {
    const list = urlKey ? urlKey.split("\n") : [];
    shown?.add(list);
    return () => shown?.remove(list);
  }, [shown, urlKey]);

  const pending = live || isFetching || !isFetched;
  return { slots, done: urls.length, pending, lookupFailed: isError && urls.length === 0 && !pending };
}

/**
 * One placeholder per requested image, each swapped for the real image as soon as
 * imggen finishes it. Rendered under the Bash tool call that ran imggen; `ts` /
 * `doneTs` are when that call started and returned, `turnLive` whether its turn
 * is still streaming.
 */
export function ImageJobCard({ job, ts, doneTs, turnLive }: { job: ImggenJob; ts: number; doneTs?: number; turnLive: boolean }) {
  const t = useTranslations("image_job");
  const { slots, done, pending, lookupFailed } = useImageJob(job, ts, doneTs, turnLive);
  return (
    <div className="ml-[29px] mr-[14px] mb-[8px]">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-ao-fg-3 mb-[6px]">
        {lookupFailed
          ? t("lookup_failed")
          : pending && done < job.count
            ? t("generating", { done, count: job.count })
            : t("finished", { done, missing: job.count - done })}
      </div>
      <div className="flex flex-wrap gap-2">
        {slots.map((img, i) =>
          img ? (
            <InlineImage key={`${img.date}/${img.filename}`} src={API_ROUTES.generatedImage(img.date, img.filename)} />
          ) : (
            <div
              key={`slot-${i}`}
              role="img"
              aria-label={pending ? t("slot_generating") : t("slot_missing")}
              className={`w-[140px] h-[140px] shrink-0 rounded-[8px] border border-dashed border-ao-line-1 bg-ao-bg-3 flex items-center justify-center font-mono text-[10.5px] text-ao-fg-3 ${pending ? "animate-[ao-pulse_1.5s_infinite]" : ""}`}
            >
              {pending ? t("slot_generating") : t("slot_missing")}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
