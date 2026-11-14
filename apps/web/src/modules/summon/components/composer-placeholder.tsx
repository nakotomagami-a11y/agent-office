"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMissionShortcut } from "@/modules/missions/hooks/use-mission-shortcut";

const HINT_KEYS = ["help", "slash", "attach", "newline", "missions", "clear"] as const;

const IN_STAGGER_MS = 18;
const OUT_STAGGER_MS = 8;
const IN_MS = 420;
const OUT_MS = 240;
const HOLD_MS = 2400;
const HOLD_PER_CHAR_MS = 30;

/**
 * Rotating placeholder for the composer: each hint rises in letter by letter, holds, then
 * lifts out the same way. A textarea's own `placeholder` cannot style single letters, so this
 * sits on top of the empty textarea. It stays mounted while the user types (`hidden`, rotation
 * paused) so a send resumes at the next hint instead of the first. Reduced motion shows one
 * static hint: text that keeps changing on its own is what those users opted out of.
 */
export function ComposerPlaceholder({ hidden }: { hidden: boolean }): React.ReactElement {
  const t = useTranslations("composer.placeholder_hints");
  const { mac } = useMissionShortcut();
  const [idx, setIdx] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const chars = Array.from(t(HINT_KEYS[idx]!, { mac: String(mac) }));

  useEffect(() => {
    if (hidden || prefersReducedMotion()) return;
    const ms = leaving
      ? OUT_MS + chars.length * OUT_STAGGER_MS
      : IN_MS + chars.length * (IN_STAGGER_MS + HOLD_PER_CHAR_MS) + HOLD_MS;
    const timer = setTimeout(() => {
      if (leaving) setIdx((i) => (i + 1) % HINT_KEYS.length);
      setLeaving(!leaving);
    }, ms);
    return () => clearTimeout(timer);
  }, [leaving, chars.length, hidden]);

  // Hidden mid-exit: move on now, so the reveal types in a fresh hint instead of flashing the old one.
  useEffect(() => {
    if (!hidden || !leaving) return;
    setIdx((i) => (i + 1) % HINT_KEYS.length);
    setLeaving(false);
  }, [hidden, leaving]);

  return (
    <div
      aria-hidden
      className={
        "absolute left-[14px] right-[14px] top-[12px] pointer-events-none select-none whitespace-pre overflow-hidden text-[14px] leading-[1.55] text-txt-4" +
        (hidden ? " hidden" : "")
      }
    >
      {chars.map((ch, i) => (
        <span
          key={`${idx}-${i}`}
          className={leaving ? "composer-hint-out" : "composer-hint-in"}
          style={{ animationDelay: `${i * (leaving ? OUT_STAGGER_MS : IN_STAGGER_MS)}ms` }}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    || document.documentElement.hasAttribute("data-reduce-motion");
}
