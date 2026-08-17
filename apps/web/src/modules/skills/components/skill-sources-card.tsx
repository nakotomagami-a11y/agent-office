"use client";

import { useState } from "react";
import { TextInput } from "@/components/ui/text-input";
import { Icon } from "@/components/ui/icon";
import { ACCENT_BTN } from "@/lib/button-styles";
import { useSkillSources, useAddSkillSource, useRemoveSkillSource } from "../hooks/use-skills";

/**
 * Manage tracked skill sources (GitHub repos scanned for SKILL.md files).
 * Built-in sources are read-only; user-added ones can be removed. Rendered as a
 * quiet, collapsible panel so it stops competing with the skill grid.
 */
export function SkillSourcesCard() {
  const sourcesQ = useSkillSources();
  const addMut = useAddSkillSource();
  const removeMut = useRemoveSkillSource();

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sources = sourcesQ.data ?? [];
  const builtIn = sources.filter((s) => s.builtIn);
  const userSources = sources.filter((s) => !s.builtIn);

  const submit = () => {
    setError(null);
    const s = input.trim();
    if (!s) return;
    addMut.mutate(s, {
      onSuccess: () => setInput(""),
      onError: (e) => setError(e instanceof Error ? e.message : String(e)),
    });
  };

  return (
    <div className="px-0.5 pt-1 pb-2 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Icon name="server" size={13} className="text-txt-3" />
        <span className="text-[12.5px] font-semibold text-txt">Skill sources</span>
        <span className="text-[11px] font-mono text-txt-4">
          {builtIn.length} built-in · {userSources.length} custom · scanned for SKILL.md
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <Icon
            name="branch"
            size={13}
            className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-txt-4"
          />
          <TextInput
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="github.com/user/repo  •  user/repo  •  user/repo@branch"
            className="pl-8"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={addMut.isPending || !input.trim()}
          className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[var(--r-md)] text-[13px] font-medium ${ACCENT_BTN}`}
        >
          <Icon name="plus" size={12} /> Add source
        </button>
      </div>
      {error ? <div className="text-[11.5px] font-mono text-[var(--error)]">{error}</div> : null}

      {userSources.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[10px] uppercase tracking-[0.12em] text-txt-4 font-mono px-0.5">Your sources</div>
          {userSources.map((s) => (
            <div
              key={`${s.source}@${s.ref}`}
              className="flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)] bg-bg-1 border border-line"
            >
              <Icon name="cpu" size={12} className="text-acc" />
              <span className="font-mono text-[12.5px] text-txt flex-1 truncate">
                {s.source}
                <span className="text-txt-3">@{s.ref}</span>
              </span>
              <button
                type="button"
                onClick={() => removeMut.mutate({ source: s.source, ref: s.ref })}
                disabled={removeMut.isPending}
                className="inline-flex items-center gap-[4px] px-[8px] py-[3px] rounded-[6px] text-[11px] text-txt-3 hover:text-[var(--error)] hover:bg-bg-3 border-none bg-transparent cursor-pointer"
              >
                <Icon name="x" size={11} /> Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] uppercase tracking-[0.12em] text-txt-4 font-mono px-0.5">Built-in</div>
        <div className="flex flex-wrap gap-1.5">
          {builtIn.map((s) => (
            <span
              key={`${s.source}@${s.ref}`}
              className="inline-flex items-center gap-[6px] px-2 py-1 rounded-[6px] bg-bg-1 border border-line font-mono text-[11.5px] text-txt-2"
            >
              <Icon name="cpu" size={10} />
              {s.source}
              <span className="text-txt-4">@{s.ref}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
