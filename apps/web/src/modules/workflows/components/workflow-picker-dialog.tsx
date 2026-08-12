"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Portal } from "@/components/ui/portal";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cn";
import {
  useWorkflows,
  useCreateWorkflow,
  useDeleteWorkflow,
  useRecordWorkflowUsage,
} from "../hooks/use-workflows";
import type { Workflow } from "@agent-office/domain/types";

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "starter",
  "debugging",
  "planning",
  "review",
  "writing",
  "research",
  "testing",
  "refactoring",
  "analysis",
  "general",
] as const;

type Category = (typeof CATEGORIES)[number];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface WorkflowPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (body: string) => void;
}

// ── Workflow card ────────────────────────────────────────────────────────────

function WorkflowCard({
  workflow,
  onSelect,
  onDelete,
}: {
  workflow: Workflow;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const isStarter = workflow.category === "starter";
  return (
    <div className="group relative rounded-[10px] border border-line bg-bg-1 hover:border-[var(--acc)] transition-[border-color] duration-[120ms]">
      <button
        type="button"
        className="w-full text-left px-[12px] pt-[10px] pb-[10px] pr-[36px] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc rounded-[10px]"
        onClick={onSelect}
      >
        <div className="font-semibold text-[13px] text-txt leading-snug mb-[4px]">
          {workflow.title}
        </div>
        <div className="text-[12px] text-txt-2 leading-[1.45] line-clamp-2">
          {workflow.body}
        </div>
        <div className="flex items-center gap-[6px] mt-[7px]">
          <span
            className={cn(
              "inline-flex items-center px-[6px] py-[2px] rounded-full border text-[10.5px] font-mono",
              isStarter
                ? "bg-[color-mix(in_oklch,var(--acc)_10%,transparent)] border-[color-mix(in_oklch,var(--acc)_40%,transparent)] text-[var(--acc)]"
                : "bg-bg-2 border-line text-txt-3",
            )}
          >
            {capitalize(workflow.category)}
          </span>
          {workflow.useCount > 0 && (
            <span className="text-[10.5px] text-txt-4 font-mono">
              {workflow.useCount}×
            </span>
          )}
        </div>
      </button>
      {/* Delete button - hidden for starter workflows to prevent nuking curated set */}
      {!isStarter && (
        <button
          type="button"
          aria-label={t("workflows.delete_aria")}
          className="absolute top-[8px] right-[8px] w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-txt-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--error)] hover:bg-bg-2 transition-[opacity,color,background] duration-[100ms] cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  );
}

// ── Add form ─────────────────────────────────────────────────────────────────

function AddWorkflowForm({ onAdded }: { onAdded?: () => void }) {
  const t = useTranslations();
  const createMut = useCreateWorkflow();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<string>("general");

  const canSave = title.trim().length > 0 && body.trim().length > 0;

  const handleSave = () => {
    if (!canSave || createMut.isPending) return;
    createMut.mutate(
      { title: title.trim(), body: body.trim(), category },
      {
        onSuccess: () => {
          setTitle("");
          setBody("");
          setCategory("general");
          onAdded?.();
        },
      },
    );
  };

  return (
    <div data-add-form className="border-t border-line px-[16px] py-[14px] flex flex-col gap-[8px]">
      <input
        type="text"
        placeholder={t("workflows.add_title_placeholder")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full h-[32px] px-[10px] bg-bg-2 border border-line-2 rounded-[8px] text-txt text-[12px] outline-none [font:inherit] focus:border-[var(--acc)] transition-[border-color] duration-[120ms] placeholder:text-txt-4"
      />
      <textarea
        placeholder={t("workflows.add_body_placeholder")}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full px-[10px] py-[8px] bg-bg-2 border border-line-2 rounded-[8px] text-txt text-[12px] leading-[1.5] outline-none resize-none [font:inherit] focus:border-[var(--acc)] transition-[border-color] duration-[120ms] placeholder:text-txt-4"
      />
      <div className="flex items-center gap-[8px]">
        <label className="text-[11.5px] text-txt-2 shrink-0">
          {t("workflows.add_category_label")}
        </label>
        <DropdownMenu
          align="start"
          ariaLabel={t("workflows.add_category_label")}
          triggerClassName="h-[28px] px-[10px] bg-bg-2 border-line-2 rounded-[7px] text-txt text-[12px] hover:bg-bg-3"
          trigger={
            <>
              {capitalize(category)}
              <Icon name="chevron-down" size={13} className="text-txt-3" />
            </>
          }
          items={CATEGORIES.map((c) => ({
            key: c,
            label: capitalize(c),
            selected: c === category,
            onSelect: () => setCategory(c),
          }))}
        />
        <Button
          size="sm"
          variant="primary"
          className="ml-auto"
          disabled={!canSave || createMut.isPending}
          onClick={handleSave}
        >
          {createMut.isPending ? t("common.saving") : t("workflows.add_save_button")}
        </Button>
      </div>
    </div>
  );
}

// ── Dialog ───────────────────────────────────────────────────────────────────

export function WorkflowPickerDialog({ open, onClose, onSelect }: WorkflowPickerDialogProps) {
  // NOTE: intentionally NOT registered with the global modal-manager. This
  // dialog opens from within the conversation inspector — itself a registered
  // modal — and the manager's replace semantics would close that ancestor,
  // unmounting the composer and this dialog with it. The dialog self-manages
  // dismissal via its own Escape handler and backdrop click below.
  const t = useTranslations();
  const [rawSearch, setRawSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | undefined>(undefined);

  const deleteMut = useDeleteWorkflow();
  const recordUsage = useRecordWorkflowUsage();

  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Debounce the search query by 200ms
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(rawSearch), 200);
    return () => clearTimeout(id);
  }, [rawSearch]);

  // Focus search on open; reset state on close
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 30);
    } else {
      setRawSearch("");
      setDebouncedSearch("");
      setActiveCategory(undefined);
    }
  }, [open]);

  // Escape / focus-trap
  useEffect(() => {
    if (!open) return;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        // If focus is inside the add-prompt form, only blur it (don't discard
        // the user's in-progress text by closing the whole dialog).
        const inForm = !!(document.activeElement as Element | null)?.closest(
          "[data-add-form]",
        );
        if (inForm) {
          (document.activeElement as HTMLElement | null)?.blur();
          return;
        }
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const els = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((el) => el.offsetParent !== null);
      if (els.length === 0) return;
      const first = els[0]!;
      const last = els[els.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prev = document.activeElement as HTMLElement | null;
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  const workflowsQ = useWorkflows({
    q: debouncedSearch || undefined,
    category: activeCategory,
  });

  // Sort: starter workflows first, then by useCount DESC, then createdAt DESC.
  // Starters lead so a fresh user sees the curated set at the top even before
  // running one.
  const sorted = useMemo(() => {
    const data = workflowsQ.data ?? [];
    return [...data].sort((a, b) => {
      const aStarter = a.category === "starter" ? 1 : 0;
      const bStarter = b.category === "starter" ? 1 : 0;
      if (aStarter !== bStarter) return bStarter - aStarter;
      return b.useCount - a.useCount || b.createdAt - a.createdAt;
    });
  }, [workflowsQ.data]);

  const handleSelect = (workflow: Workflow) => {
    recordUsage.mutate(workflow.id);
    onSelect(workflow.body);
    onClose();
  };

  const handleDelete = (id: string) => {
    deleteMut.mutate(id);
  };

  if (!open) return null;

  return (
    <Portal>
      {/* Backdrop */}
      <div
        role="presentation"
        className="app-modal-backdrop fixed inset-0 bg-[rgba(10,10,18,0.60)] backdrop-blur-sm flex items-start justify-center pt-[10vh] px-[16px] z-[200]"
        style={{ top: 74 }}
        onClick={onClose}
      >
        {/* Dialog panel */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("workflows.dialog_title")}
          tabIndex={-1}
          className="relative w-full max-w-[640px] max-h-[80vh] bg-bg-1 border border-line rounded-[8px] shadow-[0_4px_24px_rgba(20,12,8,0.22),0_1px_4px_rgba(20,12,8,0.12)] flex flex-col outline-none overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-[10px] px-[14px] py-[11px] border-b border-line shrink-0">
            <Icon name="sparkle" size={15} className="text-acc shrink-0" />
            <span className="font-bold text-[13px] text-txt">{t("workflows.dialog_title")}</span>
            <button
              type="button"
              aria-label={t("workflows.close_aria")}
              className="ml-auto w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-txt-3 hover:text-txt hover:bg-bg-2 transition-[color,background] duration-[100ms] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acc"
              onClick={onClose}
            >
              <Icon name="x" size={14} />
            </button>
          </div>

          {/* Search */}
          <div className="px-[14px] pt-[10px] pb-[8px] border-b border-line shrink-0">
            <div className="relative">
              <Icon
                name="search"
                size={14}
                className="absolute left-[9px] top-1/2 -translate-y-1/2 text-txt-3 pointer-events-none"
              />
              <input
                ref={searchRef}
                type="text"
                placeholder={t("workflows.search_placeholder")}
                value={rawSearch}
                onChange={(e) => setRawSearch(e.target.value)}
                className="w-full h-[32px] pl-[30px] pr-[10px] bg-bg-2 border border-line-2 rounded-[8px] text-txt text-[13px] outline-none [font:inherit] focus:border-[var(--acc)] transition-[border-color] duration-[120ms] placeholder:text-txt-4"
              />
              {rawSearch && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute right-[7px] top-1/2 -translate-y-1/2 w-[18px] h-[18px] flex items-center justify-center text-txt-3 hover:text-txt cursor-pointer"
                  onClick={() => setRawSearch("")}
                >
                  <Icon name="x" size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-[2px] px-[12px] py-[8px] border-b border-line shrink-0 overflow-x-auto [scrollbar-width:none]">
            <button
              type="button"
              className={cn(
                "inline-flex items-center px-[10px] h-[26px] rounded-full text-[12px] font-medium whitespace-nowrap transition-[background,color,border-color] duration-[100ms] border cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acc",
                activeCategory === undefined
                  ? "bg-acc text-[var(--acc-ink)] border-acc"
                  : "bg-transparent text-txt-2 border-transparent hover:bg-bg-2 hover:text-txt hover:border-line",
              )}
              onClick={() => setActiveCategory(undefined)}
            >
              {t("workflows.category_all")}
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={cn(
                  "inline-flex items-center px-[10px] h-[26px] rounded-full text-[12px] font-medium whitespace-nowrap transition-[background,color,border-color] duration-[100ms] border cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acc",
                  activeCategory === cat
                    ? "bg-acc text-[var(--acc-ink)] border-acc"
                    : "bg-transparent text-txt-2 border-transparent hover:bg-bg-2 hover:text-txt hover:border-line",
                )}
                onClick={() =>
                  setActiveCategory((prev) => (prev === cat ? undefined : cat))
                }
              >
                {capitalize(cat)}
              </button>
            ))}
          </div>

          {/* Workflow list */}
          <div className="flex-1 min-h-0 overflow-y-auto px-[12px] py-[10px]">
            {workflowsQ.isLoading ? (
              <div className="text-txt-3 text-[12px] py-[20px] text-center">
                {t("common.loading")}
              </div>
            ) : sorted.length === 0 ? (
              <div className="flex flex-col items-center gap-[6px] py-[32px] text-center">
                <Icon name="sparkle" size={24} className="text-txt-4" />
                <div className="text-[13px] text-txt-2">{t("workflows.empty_state")}</div>
                {!rawSearch && !activeCategory && (
                  <div className="text-[12px] text-txt-3">{t("workflows.empty_add_hint")}</div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-[6px]">
                {sorted.map((workflow) => (
                  <WorkflowCard
                    key={workflow.id}
                    workflow={workflow}
                    onSelect={() => handleSelect(workflow)}
                    onDelete={() => handleDelete(workflow.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Add workflow form */}
          <AddWorkflowForm />
        </div>
      </div>
    </Portal>
  );
}
