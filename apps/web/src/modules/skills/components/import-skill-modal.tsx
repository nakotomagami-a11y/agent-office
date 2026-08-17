"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { TextInput } from "@/components/ui/text-input";
import { Textarea } from "@/components/ui/textarea";
import { Icon, type IconName } from "@/components/ui/icon";
import { ACCENT_BTN } from "@/lib/button-styles";

type ImportMode = "github" | "paste";

interface ImportSkillModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Bring an external skill in. Two intakes: a GitHub URL/repo, or a pasted
 * SKILL.md. Visual shell — submit closes; the functional pass maps GitHub to
 * the sources+install path and paste to a local write.
 */
export function ImportSkillModal({ open, onClose }: ImportSkillModalProps) {
  const [mode, setMode] = useState<ImportMode>("github");
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");

  const canSubmit = mode === "github" ? url.trim().length > 0 : paste.trim().length > 0;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Import a skill"
      size="md"
      maxWidth={560}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-8 px-4 rounded-[8px] text-[13px] font-medium text-txt-2 bg-transparent border border-line hover:bg-bg-3 hover:text-txt transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={!canSubmit}
            className={`inline-flex items-center gap-1.5 h-8 px-4 rounded-[8px] text-[13px] font-medium ${ACCENT_BTN}`}
          >
            <Icon name="download" size={13} /> Import
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <ModeTile
            active={mode === "github"}
            icon="branch"
            title="From GitHub"
            sub="Repo or direct skill URL"
            onClick={() => setMode("github")}
          />
          <ModeTile
            active={mode === "paste"}
            icon="code"
            title="Paste SKILL.md"
            sub="Drop the file contents"
            onClick={() => setMode("paste")}
          />
        </div>

        {mode === "github" ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-txt">Repository or skill URL</span>
            <TextInput
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="github.com/user/repo  •  user/repo@branch"
            />
            <span className="text-[11px] text-txt-4">
              We scan the repo for <span className="font-mono text-txt-3">SKILL.md</span> files and let you
              pick which to install.
            </span>
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-txt">SKILL.md contents</span>
            <Textarea
              rows={9}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={"---\nname: my-skill\ndescription: …\n---\n\n# My Skill"}
              className="font-mono text-[12px] leading-[1.55]"
            />
            <span className="text-[11px] text-txt-4">
              Saved to <span className="font-mono text-txt-3">_skills/&lt;name&gt;/SKILL.md</span> using the
              frontmatter name.
            </span>
          </label>
        )}
      </div>
    </ModalShell>
  );
}

function ModeTile({
  active,
  icon,
  title,
  sub,
  onClick,
}: {
  active: boolean;
  icon: IconName;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 flex flex-col gap-1 items-start text-left p-3 rounded-[var(--r-md)] border transition-colors ${
        active
          ? "bg-ao-accent-soft border-ao-accent-line"
          : "bg-bg-1 border-line hover:border-line-2 hover:bg-bg-2"
      }`}
    >
      <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${active ? "text-acc" : "text-txt"}`}>
        <Icon name={icon} size={14} /> {title}
      </span>
      <span className="text-[11.5px] text-txt-3">{sub}</span>
    </button>
  );
}
