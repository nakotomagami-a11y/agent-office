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
            "inline-flex items-center h-[18px] px-[6px] rounded-[5px] text-[10px] font-mono uppercase tracking-[0.05em] " +
            {
              bad: "text-[var(--error)] bg-[color-mix(in_oklab,var(--error)_15%,transparent)]",
              warn: "text-[var(--warn,#c78a2a)] bg-[color-mix(in_oklab,var(--warn,#c78a2a)_15%,transparent)]",
              good: "text-status-done bg-[color-mix(in_oklab,var(--status-done,#3a9)_15%,transparent)]",
              muted: "text-txt-3 bg-bg-3",
            }[b.tone]
          }
        >
          {b.text}
        </span>
      ))}
    </span>
  );
}
