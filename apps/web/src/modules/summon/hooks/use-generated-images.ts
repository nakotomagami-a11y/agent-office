"use client";

import { useQuery } from "@tanstack/react-query";
import { API_ROUTES } from "@agent-office/domain/config/routes";
import type { GeneratedImageRef } from "@agent-office/domain/config/generated-images";
import { apiFetch } from "@agent-office/domain/hooks/api";
import { queryKeys } from "@agent-office/domain/hooks/query-keys";
import type { ImggenJob } from "../format/imggen-command";

const POLL_MS = 1500;

/**
 * The files one imggen job has written so far (none older than `sinceMs`).
 * Polls while the job is short of `count` and either its turn is live or, for a
 * backgrounded job, `deadline` hasn't passed — checked at each poll, so it stops
 * on its own.
 */
export function useGeneratedImages(job: ImggenJob, sinceMs: number, turnLive: boolean, deadline: number) {
  const seeds = job.seeds ? `&seeds=${job.seeds.join(",")}` : "";
  return useQuery({
    queryKey: queryKeys.generatedImages(job.slug, `${sinceMs}${seeds}@${job.offset}`),
    queryFn: async () => {
      const res = await apiFetch<{ images: GeneratedImageRef[] }>(
        `${API_ROUTES.generatedImages}?name=${encodeURIComponent(job.slug)}&since=${sinceMs}${seeds}`,
      );
      return res.images;
    },
    refetchInterval: (query) =>
      query.state.status !== "error" &&
      (query.state.data?.length ?? 0) < job.offset + job.count &&
      (turnLive || (job.background && Date.now() < deadline))
        ? POLL_MS
        : false,
  });
}
