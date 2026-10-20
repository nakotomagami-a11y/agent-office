"use client";

import { useTranslations } from "next-intl";
import { isReservedEnvName } from "@agent-office/domain/config/providers";

/**
 * Names the app owns (`AO_*` and the AI-provider variables) are never taken from a project
 * secret, so a secret saved under one would look set and do nothing. Say so before it is saved.
 */
export function ReservedNameNote({ name }: { name: string }) {
  const t = useTranslations("providers");
  if (!name || !isReservedEnvName(name)) return null;
  return (
    <p role="note" className="m-0 text-[11.5px] leading-[1.55] text-amber text-pretty">
      {t("reserved_name_note", { name })}
    </p>
  );
}
