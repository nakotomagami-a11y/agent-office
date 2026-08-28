"use client";

import type { SecretWithStatus } from "../hooks/use-secrets";

const DAY = 86_400_000;

/** Expiry + live-validity badges shared by the settings tab and project panel. */
export function SecretBadges({ secret }: { secret: SecretWithStatus }) {
  const badges: Array<{ text: string; tone: "bad" | "warn" | "good" | "muted" }> = [];

  if (secret.expiresAt) {
    if (secret.expired) badges.push({ text: "expired", tone: "bad" });
    else if (secret.expiresAt - Date.now() < 7 * DAY) badges.push({ text: "expiring soon", tone: "warn" });
    else badges.push({ text: `expires ${new Date(secret.expiresAt).toISOString().slice(0, 10)}`, tone: "muted" });
  }

  if (secret.lastTestOk === true) badges.push({ text: "valid", tone: "good" });
  else if (secret.lastTestOk === false) badges.push({ text: "test failed", tone: "bad" });
  else if (secret.testCmd) badges.push({ text: "untested", tone: "muted" });

  if (secret.verifyBeforeRun) badges.push({ text: "verify-on-run", tone: "muted" });

  if (badges.length === 0) return null;

  return (
    <span className="flex flex-wrap items-center gap-[5px]">
      {badges.map((b) => (
        <span
          key={b.text}
          className={
            "inline-flex items-center py-[1.5px] px-[8px] rounded-full text-[9px] font-extrabold uppercase tracking-[0.06em] whitespace-nowrap " +
            {
              bad: "text-red bg-red-soft",
              warn: "text-amber bg-amber-soft",
              good: "text-green bg-green-soft",
              muted: "text-txt-3 bg-card-3",
            }[b.tone]
          }
        >
          {b.text}
        </span>
      ))}
    </span>
  );
}
