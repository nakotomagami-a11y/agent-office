"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { TextInput } from "@/components/ui/text-input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { useImportSkill, useAddSkillSource } from "../hooks/use-skills";

type ImportMode = "github" | "paste";

interface ImportSkillModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Bring an external skill in. Two intakes: a GitHub repo/URL — added as a skill
 * source so its skills surface in the list to install — or a pasted SKILL.md,
 * written straight to a local skill using its frontmatter name.
 */
export function ImportSkillModal({ open, onClose }: ImportSkillModalProps) {
  const [mode, setMode] = useState<ImportMode>("github");
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");

  const importMut = useImportSkill();
  const addSourceMut = useAddSkillSource();
  const pending = importMut.isPending || addSourceMut.isPending;

  const canSubmit =
    (mode === "github" ? url.trim().length > 0 : paste.trim().length > 0) && !pending;

  const errorMessage = (() => {
    const err = (mode === "github" ? addSourceMut.error : importMut.error) as
      | (Error & { status?: number })
      | null;
    if (!err) return null;
    if (err.message === "skill_exists") return "A skill with that name already exists.";
    return err.message || "Import failed. Check the input and try again.";
  })();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      if (mode === "github") {
        await addSourceMut.mutateAsync(url.trim());
      } else {
        await importMut.mutateAsync(paste);
      }
      setUrl("");
      setPaste("");
      onClose();
    } catch {
      // error surfaced inline via errorMessage; keep the modal open.
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Import a skill"
      size="md"
      maxWidth={560}
      footer={
        <>
          {errorMessage ? (
            <span className="mr-auto flex items-center gap-1.5 text-[11.5px] font-medium text-status-error">
              <Icon name="slash" size={12} /> {errorMessage}
            </span>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
            <Icon name={pending ? "refresh" : mode === "github" ? "branch" : "download"} size={13} />
            {pending ? (mode === "github" ? "Adding…" : "Importing…") : mode === "github" ? "Add source" : "Import"}
          </Button>
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
