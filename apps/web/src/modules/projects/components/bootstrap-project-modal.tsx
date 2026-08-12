"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ModalShell } from "@/components/ui/modal-shell";
import { Icon } from "@/components/ui/icon";
import { ACCENT_BTN } from "@/lib/button-styles";
import { PAGE_ROUTES } from "@agent-office/domain/config/routes";
import {
  useBootstrapProject,
  type FrontendChoice,
  type BackendChoice,
  type BootstrapResult,
} from "../hooks/use-bootstrap-project";

interface BootstrapProjectModalProps {
  open: boolean;
  onClose: () => void;
}

interface FrameworkOption<T extends string> {
  id: T;
  label: string;
  description: string;
}

const FRONTEND_OPTIONS: FrameworkOption<FrontendChoice>[] = [
  { id: "next", label: "Next.js", description: "App Router, server components, full-stack capable" },
  { id: "vite", label: "Vite", description: "SPA, lightning HMR, no SSR" },
  { id: "react", label: "React (plain)", description: "Library or widget for a host page" },
  { id: "none", label: "None", description: "Backend-only or bare project" },
];

const BACKEND_OPTIONS: FrameworkOption<BackendChoice>[] = [
  { id: "none", label: "None", description: "Frontend-only project" },
  { id: "node", label: "Node.js (Hono)", description: "Hono + Drizzle + libSQL" },
  { id: "python", label: "Python (FastAPI)", description: "FastAPI + SQLAlchemy + libSQL" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function BootstrapProjectModal({ open, onClose }: BootstrapProjectModalProps) {
  const bootstrap = useBootstrapProject();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frontend, setFrontend] = useState<FrontendChoice>("next");
  const [backend, setBackend] = useState<BackendChoice>("none");
  const [result, setResult] = useState<BootstrapResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset form state when the modal opens. Intentionally only depends on
  // `open` - including the mutation object would re-fire this on every render
  // (mutation object identity changes) and wipe what the user types.
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setFrontend("next");
      setBackend("none");
      setResult(null);
      setErrorMsg(null);
      bootstrap.reset();
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally scoped to `open` transitions
  }, [open]);

  const slug = slugify(name);
  const canSubmit = name.trim().length > 0 && slug.length > 0 && !bootstrap.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setErrorMsg(null);
    try {
      const r = await bootstrap.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        frontend,
        backend,
      });
      setResult(r);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  // Success state - replaces the form
  if (result) {
    return (
      <ModalShell
        open={open}
        onClose={onClose}
        title="Project created"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center px-4 py-[7px] rounded-[8px] text-[13px] font-medium text-txt-2 bg-transparent border border-line hover:bg-bg-3 hover:text-txt transition-colors"
            >
              Close
            </button>
            {result.project ? (
              <Link
                href={PAGE_ROUTES.project(result.project.id)}
                onClick={onClose}
                className={`inline-flex items-center gap-[6px] px-4 py-[7px] rounded-[8px] text-[13px] font-semibold ${ACCENT_BTN} transition-colors cursor-pointer no-underline`}
              >
                Open project
                <Icon name="chevron" size={13} />
              </Link>
            ) : null}
          </>
        }
      >
        <div className="space-y-[14px]">
          <div className="flex items-start gap-[10px] p-[12px] rounded-[8px] bg-[rgba(80,200,120,0.08)] border border-[rgba(80,200,120,0.25)]">
            <Icon name="check" size={16} className="text-[rgb(80,200,120)] mt-[1px] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-txt font-semibold">{result.slug}</div>
              <div className="font-[var(--font-mono)] text-[11px] text-txt-2 mt-[2px] truncate">
                {result.path}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-[10px] text-[12px] [&>*]:basis-[calc(50%-5px)]">
            <div className="px-[12px] py-[10px] rounded-[8px] bg-bg-2 border border-line">
              <div className="text-txt-3 text-[11px] font-[var(--font-mono)] mb-[2px]">FILES</div>
              <div className="text-txt font-semibold">{result.fileCount}</div>
            </div>
            <div className="px-[12px] py-[10px] rounded-[8px] bg-bg-2 border border-line">
              <div className="text-txt-3 text-[11px] font-[var(--font-mono)] mb-[2px]">GIT</div>
              <div className="text-txt font-semibold">
                {result.gitInitialized ? "initialized" : "skipped"}
              </div>
            </div>
          </div>

          {result.warning ? (
            <div className="px-[12px] py-[10px] rounded-[8px] bg-[rgba(255,180,0,0.06)] border border-[rgba(255,180,0,0.2)] text-[12px] text-txt-2">
              <span className="text-[rgb(255,180,0)] font-semibold">Note: </span>
              {result.warning}
            </div>
          ) : null}

          <div className="text-[12px] text-txt-3 leading-relaxed">
            Open the folder in your editor and run the install command from the project README. The
            wizard skips package install on purpose - frameworks are version-sensitive.
          </div>
        </div>
      </ModalShell>
    );
  }

  // Form state
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="New project"
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={bootstrap.isPending}
            className="inline-flex items-center px-4 py-[7px] rounded-[8px] text-[13px] font-medium text-txt-2 bg-transparent border border-line hover:bg-bg-3 hover:text-txt transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="bootstrap-project-form"
            disabled={!canSubmit}
            className={`inline-flex items-center gap-[6px] px-4 py-[7px] rounded-[8px] text-[13px] font-semibold ${ACCENT_BTN} transition-colors cursor-pointer`}
          >
            {bootstrap.isPending ? "Creating…" : "Create project"}
          </button>
        </>
      }
    >
      <form id="bootstrap-project-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-[16px]">
        {/* Name + slug preview */}
        <div>
          <label className="block text-[12px] text-txt-3 font-[var(--font-mono)] mb-[6px]">
            Project name
          </label>
          <div className="relative">
            <Icon
              name="folder"
              size={17}
              className="absolute left-[12px] top-1/2 -translate-y-1/2 text-txt-3 pointer-events-none"
            />
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              disabled={bootstrap.isPending}
              className="w-full bg-[rgba(255,255,255,0.04)] rounded-[10px] pl-[38px] pr-[12px] py-[11px] text-[14px] text-txt outline-none border-0
                hover:bg-[rgba(255,255,255,0.07)] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]
                focus:bg-[rgba(255,255,255,0.07)] focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]
                transition-[background,box-shadow] duration-150
                placeholder:text-[rgba(255,255,255,0.22)] disabled:opacity-60"
            />
          </div>
          {slug && slug !== name && (
            <div className="mt-[6px] text-[11px] font-[var(--font-mono)] text-txt-3">
              folder: <span className="text-txt-2">{slug}</span>
            </div>
          )}
        </div>

        {/* Description (optional) */}
        <div>
          <label className="block text-[12px] text-txt-3 font-[var(--font-mono)] mb-[6px]">
            Description <span className="opacity-50">(optional)</span>
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One-line description"
            disabled={bootstrap.isPending}
            className="w-full bg-[rgba(255,255,255,0.04)] rounded-[10px] px-[12px] py-[10px] text-[13px] text-txt outline-none border-0
              hover:bg-[rgba(255,255,255,0.07)] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]
              focus:bg-[rgba(255,255,255,0.07)] focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]
              transition-[background,box-shadow] duration-150
              placeholder:text-[rgba(255,255,255,0.22)] disabled:opacity-60"
          />
        </div>

        {/* Frontend selector */}
        <ChoiceGroup
          label="Frontend"
          options={FRONTEND_OPTIONS}
          value={frontend}
          onChange={setFrontend}
          disabled={bootstrap.isPending}
        />

        {/* Backend selector */}
        <ChoiceGroup
          label="Backend"
          options={BACKEND_OPTIONS}
          value={backend}
          onChange={setBackend}
          disabled={bootstrap.isPending}
        />

        {/* Error */}
        {errorMsg && (
          <div className="px-[12px] py-[10px] rounded-[8px] bg-[rgba(220,80,80,0.08)] border border-[rgba(220,80,80,0.25)] text-[12px] text-txt-2">
            <span className="text-[rgb(220,100,100)] font-semibold">Error: </span>
            {errorMsg}
          </div>
        )}

        {/* Summary */}
        <div className="mt-[6px] px-[12px] py-[10px] rounded-[8px] bg-bg-2 border border-line text-[11.5px] text-txt-3 leading-relaxed">
          Creates <span className="font-[var(--font-mono)] text-txt-2">{slug || "<slug>"}</span>{" "}
          with{" "}
          {frontend !== "none" && (
            <span className="font-[var(--font-mono)] text-txt-2">frontend/</span>
          )}
          {frontend !== "none" && backend !== "none" && " + "}
          {backend !== "none" && (
            <span className="font-[var(--font-mono)] text-txt-2">backend/</span>
          )}
          {frontend === "none" && backend === "none" && (
            <span className="text-txt-2">no template scaffold</span>
          )}
          . CLAUDE.md, DECISIONS.md, PLAN.md and README.md written. Git initialized.
        </div>
      </form>
    </ModalShell>
  );
}

interface ChoiceGroupProps<T extends string> {
  label: string;
  options: FrameworkOption<T>[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: ChoiceGroupProps<T>) {
  return (
    <div>
      <label className="block text-[12px] text-txt-3 font-[var(--font-mono)] mb-[6px]">{label}</label>
      <div className={`flex flex-wrap gap-[8px] ${options.length <= 3 ? "[&>*]:basis-[calc(33.333%-6px)]" : "[&>*]:basis-[calc(25%-6px)]"}`}>
        {options.map((opt) => {
          const selected = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              disabled={disabled}
              className={[
                "text-left px-[12px] py-[10px] rounded-[10px] border transition-all duration-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
                selected
                  ? "bg-[rgba(255,120,60,0.10)] border-[rgba(255,120,60,0.45)] shadow-[inset_0_0_0_1px_rgba(255,120,60,0.2)]"
                  : "bg-[rgba(255,255,255,0.03)] border-line hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]",
              ].join(" ")}
            >
              <div className={["text-[12.5px] font-semibold leading-tight", selected ? "text-acc" : "text-txt"].join(" ")}>
                {opt.label}
              </div>
              <div className="text-[10.5px] text-txt-3 mt-[3px] leading-snug">{opt.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
