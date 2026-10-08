"use client";

import { useTranslations } from "next-intl";
import { Tooltip } from "@/components/ui/tooltip";
import { openReleasesPage } from "@/lib/updater";

/**
 * The running build, always visible.
 *
 * `UpdateBell` renders nothing while you are up to date, so until now the only
 * places the version appeared were the dev menu and the Docs header — and two
 * bug reports in a row turned out to be a stale install rather than a defect.
 * A version you have to go looking for cannot do that job.
 *
 * Baked at build time from the canonical `apps/web/package.json` (see
 * next.config.mjs), which is the same value `tauri.conf.json` ships, so it
 * names the installed build and not the repo it was built from.
 */
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
const GIT_SHA = process.env.NEXT_PUBLIC_GIT_SHA ?? "";

export function VersionBadge() {
  const t = useTranslations();
  const label = `v${APP_VERSION}`;
  return (
    <Tooltip content={t("titlebar.version_title", { version: label, commit: GIT_SHA || "—" })} side="bottom" className="shrink-0">
      <button
        type="button"
        onClick={() => openReleasesPage()}
        aria-label={t("titlebar.version_aria", { version: label })}
        className="shrink-0 font-[var(--font-mono)] text-[10px] tracking-[0.06em] text-txt-4 hover:text-txt-2 bg-transparent border-0 px-[6px] py-[2px] cursor-pointer transition-colors duration-150"
      >
        {label}
      </button>
    </Tooltip>
  );
}
