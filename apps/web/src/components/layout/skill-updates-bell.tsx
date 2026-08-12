"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ACCENT_BTN } from "@/lib/button-styles";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import { useSkillUpdates, useUpdateSkill } from "@/modules/skills/hooks/use-skills";

/**
 * Bell icon in the titlebar with a red badge showing the number of
 * available skill updates. Clicking opens a notification-style dropdown
 * with per-skill "Update" buttons and a global "Update all". Silent
 * when nothing has drifted.
 */
export function SkillUpdatesBell() {
  const { data: updates = [], isLoading } = useSkillUpdates();
  const updateMut = useUpdateSkill();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (isLoading || updates.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center relative w-7 h-7 rounded-md text-txt-2 hover:bg-bg-3 hover:text-txt cursor-pointer border-none bg-transparent"
        title={`${updates.length} skill update${updates.length === 1 ? "" : "s"} available`}
        aria-label={`${updates.length} skill updates available`}
      >
        <Icon name="refresh" size={14} />
        <span
          aria-hidden
          className="absolute top-[-2px] right-[-2px] inline-flex items-center justify-center min-w-[14px] h-[14px] px-[3px] rounded-full text-[9px] font-bold text-white bg-[var(--error)] border border-bg-2"
        >
          {updates.length > 9 ? "9+" : updates.length}
        </span>
      </button>
      {open ? (
        <div className="absolute top-[calc(100%+6px)] right-0 w-[320px] bg-[var(--bg-elev)] border border-line-2 rounded-[10px] shadow-[var(--shadow-3)] z-[300] overflow-hidden">
          <div className="flex items-center gap-[8px] px-[14px] py-[10px] border-b border-line">
            <Icon name="refresh" size={12} className="text-acc" />
            <span className="font-semibold text-[13px]">Skill updates</span>
            <span className="ml-auto text-[11px] text-txt-3 font-mono">{updates.length}</span>
          </div>
          <ul className="max-h-[320px] overflow-y-auto flex flex-col">
            {updates.map((u) => (
              <li key={u.name} className="flex items-center gap-[10px] px-[14px] py-[9px] border-b border-line last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[12px] text-txt truncate">{u.name}</div>
                  <div className="font-mono text-[10.5px] text-txt-3 truncate">{u.source}</div>
                </div>
                <button
                  type="button"
                  onClick={() => updateMut.mutate(u.name)}
                  disabled={updateMut.isPending}
                  className="inline-flex items-center gap-[4px] px-[10px] py-[4px] rounded-[6px] text-[11.5px] font-semibold bg-acc-faint text-acc border border-[var(--acc-tint)] hover:bg-acc hover:text-white hover:border-acc disabled:opacity-40 cursor-pointer"
                >
                  Update
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-[8px] px-[14px] py-[8px] border-t border-line">
            <button
              type="button"
              onClick={() => { for (const u of updates) updateMut.mutate(u.name); }}
              disabled={updateMut.isPending}
              className={`${ACCENT_BTN} inline-flex items-center gap-[4px] px-[10px] py-[6px] rounded-[6px] text-[12px] font-semibold cursor-pointer`}
            >
              Update all
            </button>
            <Link
              href={PAGE_ROUTES.skills}
              onClick={() => setOpen(false)}
              className="ml-auto text-[11.5px] text-txt-3 hover:text-txt no-underline"
            >
              Manage skills →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
