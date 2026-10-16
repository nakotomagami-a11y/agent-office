"use client";

import { useTranslations } from "next-intl";
import { missionFailure } from "../format/mission-errors";

/** gh's own words help with these two; the rest say everything in their message. */
const WITH_DETAIL = new Set(["gh_failed", "worktree_failed"]);
const MAX_DETAIL = 240;

/** One sentence for a failed mission request, in the UI's language. */
export function useMissionErrorText(): (e: unknown) => string {
  const t = useTranslations("missions");
  return (e) => {
    const f = missionFailure(e);
    if (f.key === "unknown" && f.hint) return f.hint;
    const text = t(`errors.${f.key}`);
    return f.detail && WITH_DETAIL.has(f.key) ? t("error_with_detail", { text, detail: f.detail.slice(0, MAX_DETAIL) }) : text;
  };
}
