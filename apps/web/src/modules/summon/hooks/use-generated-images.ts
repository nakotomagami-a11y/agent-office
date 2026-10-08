"use client";

import { useQuery } from "@tanstack/react-query";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { GeneratedImageRef } from "@agent-office/domain/config/generated-images";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import type { ImggenJob } from "../format/imggen-command";

const POLL_MS = 1500;

/**
 * The files one imggen job wrote in [`sinceMs`, `untilMs`]. Polls while the job is
 * short of `count` and `live`; a poll error stops it until the caller refetches.
 * A card that mounts short of `count` (e.g. after switching chats mid-turn)
 * refetches even if the cached result is fresh.
 */
export function useGeneratedImages(job: ImggenJob, sinceMs: number, untilMs: number | undefined, live: boolean) {
  const seeds = job.seeds ? `&seeds=${job.seeds.join(",")}` : "";
  const until = untilMs === undefined ? "" : `&until=${untilMs}`;
  const incomplete = (data: GeneratedImageRef[] | undefined) => (data?.length ?? 0) < job.offset + job.count;
  return useQuery({
    queryKey: queryKeys.generatedImages(job.slug, `${sinceMs}${until}${seeds}@${job.offset}`),
    queryFn: async () => {
      const res = await apiFetch<{ images: GeneratedImageRef[] }>(
        `${API_ROUTES.generatedImages}?name=${encodeURIComponent(job.slug)}&since=${sinceMs}${until}${seeds}`,
      );
      return res.images;
    },
    // `until` joins the key when the call returns; keep its images on screen meanwhile.
    placeholderData: (prev) => prev,
    refetchOnMount: (query) => (incomplete(query.state.data) ? "always" : false),
    refetchInterval: (query) =>
      live && query.state.status !== "error" && incomplete(query.state.data) ? POLL_MS : false,
  });
}
