"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { CardHeader } from "@/components/ui/card-header";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useSkillSources, useAddSkillSource, useRemoveSkillSource } from "../hooks/use-skills";

/**
 * Manage tracked skill sources (GitHub repos scanned for SKILL.md files).
 * Built-in sources are read-only; user-added ones can be removed.
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
    <Card>
      <CardHeader
        title="Skill sources"
        sub={`${builtIn.length} built-in, ${userSources.length} custom · we scan each repo for SKILL.md files`}
      />
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-stretch gap-2">
          <div className="flex-1">
            <TextInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
              placeholder="github.com/user/repo  •  user/repo  •  user/repo@branch"
            />
          </div>
          <Button variant="primary" onClick={submit} disabled={addMut.isPending || !input.trim()}>
            <Icon name="plus" size={12} /> Add source
          </Button>
        </div>
        {error ? (
          <div className="text-[11.5px] font-mono text-[var(--error)]">{error}</div>
        ) : null}

        {userSources.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-[10.5px] uppercase tracking-[0.1em] text-txt-4 font-mono px-1 mt-1">Your sources</div>
            {userSources.map((s) => (
              <div key={`${s.source}@${s.ref}`} className="flex items-center gap-2 px-3 py-2 rounded-md bg-bg-2 border border-line">
                <Icon name="cpu" size={12} className="text-acc" />
                <span className="font-mono text-[12.5px] text-txt flex-1 truncate">{s.source}<span className="text-txt-3">@{s.ref}</span></span>
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

        <div className="flex flex-col gap-1">
          <div className="text-[10.5px] uppercase tracking-[0.1em] text-txt-4 font-mono px-1 mt-1">Built-in</div>
          <div className="flex flex-wrap gap-2">
            {builtIn.map((s) => (
              <span key={`${s.source}@${s.ref}`} className="inline-flex items-center gap-[6px] px-2 py-1 rounded-[6px] bg-bg-2 border border-line font-mono text-[11.5px] text-txt-2">
                <Icon name="cpu" size={10} />
                {s.source}<span className="text-txt-3">@{s.ref}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
