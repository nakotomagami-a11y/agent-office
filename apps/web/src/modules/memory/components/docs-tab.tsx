"use client";

/**
 * Docs tab — long-form agent-authored context files.
 *
 * Layout mirrors the Memory tab exactly: a 268px `rounded-[22px]
 * surface-sheen shadow-[var(--lift)]` nav card on the left, gap-[14px], then
 * a same-treatment card on the right holding the editor. Doc rows are pill
 * cards (not a flat VS Code-style list), grouped by category the same way
 * `MemoryNav` groups by projects/agents.
 *
 * A doc is NOT the same as a memory file — memory is a small always-injected
 * note; docs are the architecture write-ups, plans, and postmortems agents
 * accumulate so the workspace builds up institutional memory. Agents write
 * these via `PUT /api/agent-docs/[owner]/[slug]`; users can edit and delete
 * them here. Creation happens through a `ModalShell` (matching every other
 * "new X" flow in the app) instead of an inline floating form, and the nav
 * gets the same icon+input filter row as `MemoryNav`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { ACCENT_BTN, Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";
import { TextInput } from "@/components/ui/text-input";
import { DropdownMenu, type DropdownItem } from "@/components/ui/dropdown-menu";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format-date";
import {
  DOC_CATEGORIES,
  type DocCategory,
  type DocMeta,
  useAgentDoc,
  useAgentDocs,
  useDeleteAgentDoc,
  useUpsertAgentDoc,
} from "../hooks/use-agent-docs";
import { MemoryEditor } from "./memory-editor";

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Selected-doc reducer ─────────────────────────────────────────────────────

interface DocSelection {
  owner: string;
  slug: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ── Nav ──────────────────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<DocCategory, IconName> = {
  architecture: "code",
  plan: "sparkle",
  notes: "pen",
  postmortem: "hammer",
  context: "book",
  reference: "search",
};

function CategorySection({
  category,
  docs,
  selected,
  onSelect,
}: {
  category: DocCategory;
  docs: DocMeta[];
  selected: DocSelection | null;
  onSelect: (sel: DocSelection) => void;
}) {
  if (docs.length === 0) return null;
  return (
    <div className="flex flex-col gap-[1px]">
      <div className="flex items-center gap-[7px] mt-[6px] px-[4px] pt-[8px] pb-[6px] select-none">
        <Icon name={CATEGORY_ICON[category]} size={11} className="shrink-0 text-txt-4" />
        <span className="text-[9.5px] font-bold tracking-[0.09em] uppercase text-txt-4 whitespace-nowrap">{category}</span>
        <span className="flex-1 h-px bg-edge" />
        <span className="font-[var(--font-mono)] text-[10px] text-txt-4">{docs.length}</span>
      </div>
      {docs.map((d) => {
        const isSelected = selected?.owner === d.owner && selected?.slug === d.slug;
        const isNew = Date.now() - new Date(d.updated).getTime() < DAY_MS;
        return (
          <button
            key={`${d.owner}/${d.slug}`}
            type="button"
            onClick={() => onSelect({ owner: d.owner, slug: d.slug })}
            className={cn(
              "flex flex-col gap-[6px] w-full py-[12px] px-[13px] rounded-[15px] text-left cursor-pointer border shadow-[var(--inset-hi)] transition-[border-color,background-color] duration-[140ms] font-[inherit]",
              isSelected ? "bg-acc-faint border-[var(--acc)]" : "bg-transparent border-edge hover:border-edge-2",
            )}
          >
            <div className="flex items-center gap-[8px]">
              <span
                className={cn(
                  "flex-1 min-w-0 text-[12.5px] font-semibold overflow-hidden text-ellipsis whitespace-nowrap",
                  isSelected ? "text-acc" : "text-txt",
                )}
              >
                {d.title}
              </span>
              {isNew && <span className="w-[5px] h-[5px] rounded-full bg-acc shrink-0" />}
            </div>
            <div className="flex items-center gap-[7px]">
              <span className="font-[var(--font-mono)] text-[10px] text-txt-4 overflow-hidden text-ellipsis whitespace-nowrap">
                {d.owner === "_global" ? "global" : d.owner}
              </span>
              <span className="w-[3px] h-[3px] rounded-full bg-txt-4 opacity-60 shrink-0" />
              <span className="font-[var(--font-mono)] text-[10px] text-txt-4 whitespace-nowrap shrink-0">
                {formatRelative(new Date(d.updated))}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DocsNav({
  docs,
  selected,
  onSelect,
  onNewDoc,
}: {
  docs: DocMeta[];
  selected: DocSelection | null;
  onSelect: (sel: DocSelection) => void;
  onNewDoc: () => void;
}) {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return docs;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.slug.toLowerCase().includes(q) ||
        d.owner.toLowerCase().includes(q),
    );
  }, [docs, q]);

  const grouped = useMemo(() => {
    const out: Record<DocCategory, DocMeta[]> = {
      architecture: [],
      plan: [],
      notes: [],
      postmortem: [],
      context: [],
      reference: [],
    };
    for (const d of filtered) out[d.category].push(d);
    return out;
  }, [filtered]);

  return (
    <div className="w-[268px] shrink-0 rounded-[22px] surface-sheen shadow-[var(--lift)] overflow-hidden flex flex-col min-h-0">
      <div className="shrink-0 p-[12px]">
        <button
          type="button"
          onClick={onNewDoc}
          className={cn(
            ACCENT_BTN,
            "w-full flex items-center justify-center gap-[8px] py-[11px] px-[13px] rounded-[15px] text-[13px] font-bold",
          )}
        >
          <Icon name="sparkle" size={14} /> New doc
        </button>
        {docs.length > 0 && (
          <div className="flex items-center gap-[9px] mt-[10px] py-[9px] px-[12px] rounded-[13px] bg-card-2 border border-edge shadow-[var(--inset-hi)] cursor-text">
            <Icon name="search" size={14} className="text-txt-4 shrink-0" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter docs…"
              className="flex-1 min-w-0 border-none bg-transparent outline-none text-[12px] text-txt placeholder:text-txt-4"
            />
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-[12px] pb-[12px] flex flex-col gap-[1px]">
        {docs.length === 0 ? (
          <NavEmptyState
            icon="book"
            title="No docs yet"
            description={
              <>
                Agents write here via{" "}
                <code className="font-[var(--font-mono)] text-[10.5px] bg-card-2 px-[4px] py-[1px] rounded-[4px]">
                  PUT /api/agent-docs/&lt;owner&gt;/&lt;slug&gt;
                </code>
                , or use the New doc button above.
              </>
            }
          />
        ) : filtered.length === 0 ? (
          <NavEmptyState icon="search" title="No matches" description={`Nothing matches “${filter}”.`} />
        ) : (
          DOC_CATEGORIES.map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              docs={grouped[cat]}
              selected={selected}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NavEmptyState({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-[12px] text-center px-[10px] py-[36px]">
      <span className="w-[42px] h-[42px] rounded-[14px] flex items-center justify-center bg-card-2 border border-edge shadow-[var(--inset-hi)] text-txt-4">
        <Icon name={icon} size={18} />
      </span>
      <div className="leading-[1.5]">
        <div className="text-[12.5px] font-bold text-txt">{title}</div>
        <div className="text-[11px] text-txt-4 mt-[4px]">{description}</div>
      </div>
    </div>
  );
}

// ── Editor pane ──────────────────────────────────────────────────────────────

function DocEditor({
  selected,
  onDeleted,
}: {
  selected: DocSelection;
  onDeleted: () => void;
}) {
  const docQ = useAgentDoc(selected.owner, selected.slug);
  const upsert = useUpsertAgentDoc();
  const del = useDeleteAgentDoc();

  if (docQ.isPending) return null;
  if (docQ.isError || !docQ.data) {
    return (
      <div className="p-6 text-[13px] text-txt-2">
        Failed to load doc.
      </div>
    );
  }
  const doc = docQ.data;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="shrink-0 flex items-center gap-[10px] px-[20px] py-[14px] border-b border-edge">
        <span className="text-[15.5px] font-bold overflow-hidden text-ellipsis whitespace-nowrap">{doc.title}</span>
        <span className="flex-1" />
        <Tag variant="skill" className="gap-[5px]">
          <Icon name={CATEGORY_ICON[doc.category]} size={10} />
          {doc.category}
        </Tag>
        <Tag>{doc.owner === "_global" ? "global" : doc.owner}</Tag>
        <button
          type="button"
          title="Delete doc"
          onClick={() => {
            if (!confirm(`Delete "${doc.title}"?`)) return;
            del.mutate(
              { owner: doc.owner, slug: doc.slug },
              { onSuccess: onDeleted },
            );
          }}
          disabled={del.isPending}
          className="w-[30px] h-[30px] shrink-0 flex items-center justify-center rounded-[10px] text-txt-4 cursor-pointer transition-colors duration-150 hover:bg-[var(--red-soft)] hover:text-[var(--red)] disabled:opacity-50"
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
      <MemoryEditor
        value={doc.body}
        onSave={async (body) => {
          await upsert.mutateAsync({
            owner: doc.owner,
            slug: doc.slug,
            title: doc.title,
            category: doc.category,
            body,
          });
        }}
        placeholder="Doc body (markdown)…"
        rows={24}
        frameless
      />
    </div>
  );
}

function DocEditorEmpty({ onNewDoc }: { onNewDoc: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-[14px] text-center p-8">
      <span className="w-[56px] h-[56px] rounded-[18px] flex items-center justify-center bg-card-2 border border-edge shadow-[var(--inset-hi)] text-txt-4">
        <Icon name="book" size={24} />
      </span>
      <div className="leading-[1.5]">
        <div className="text-[14.5px] font-bold">Select a doc, or start a new one.</div>
        <div className="text-[11.5px] text-txt-4 mt-[4px]">
          Agents write here via{" "}
          <span className="font-[var(--font-mono)]">PUT /api/agent-docs/&lt;owner&gt;/&lt;slug&gt;</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onNewDoc}
        className={cn(ACCENT_BTN, "flex items-center gap-[7px] py-[10px] px-[18px] rounded-[13px] text-[13px] font-bold")}
      >
        <Icon name="sparkle" size={14} /> New doc
      </button>
    </div>
  );
}

// ── New-doc modal ────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-[5px]">
      <span className="text-[12px] font-medium text-txt">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-txt-3 leading-[1.4]">{hint}</span> : null}
    </label>
  );
}

/** Category field — our real `DropdownMenu` popup, styled to match `TextInput`, instead of a browser-native `<select>`. */
function CategoryPicker({ value, onChange }: { value: DocCategory; onChange: (c: DocCategory) => void }) {
  const items: DropdownItem[] = DOC_CATEGORIES.map((c) => ({
    key: c,
    selected: c === value,
    indicatorStyle: "check",
    label: (
      <span className="flex items-center gap-[8px]">
        <Icon name={CATEGORY_ICON[c]} size={13} className="text-txt-4 shrink-0" />
        <span className="capitalize">{c}</span>
      </span>
    ),
    onSelect: () => onChange(c),
  }));

  return (
    <DropdownMenu
      ariaLabel="Category"
      align="start"
      matchTriggerWidth
      className="w-full"
      triggerClassName="w-full h-8 px-[10px] justify-between bg-bg-1 border border-line-2 rounded-md text-txt text-[13px] [font:inherit] shadow-1 hover:bg-bg-1 hover:border-line-2 focus-visible:border-acc"
      trigger={
        <>
          <span className="flex items-center gap-[8px] min-w-0">
            <Icon name={CATEGORY_ICON[value]} size={13} className="text-txt-4 shrink-0" />
            <span className="capitalize truncate">{value}</span>
          </span>
          <Icon name="chevron-down" size={13} className="text-txt-4 shrink-0" />
        </>
      }
      items={items}
    />
  );
}

function NewDocModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (sel: DocSelection) => void;
}) {
  const upsert = useUpsertAgentDoc();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [owner, setOwner] = useState("_global");
  const [category, setCategory] = useState<DocCategory>("notes");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSlug("");
    setSlugEdited(false);
    setOwner("_global");
    setCategory("notes");
    upsert.reset();
    setTimeout(() => titleRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open transitions
  }, [open]);

  const effectiveSlug = slugEdited ? slug : slugify(title);
  const canSave = title.trim().length > 0 && /^[a-z0-9-]+$/.test(effectiveSlug);

  const handleSave = () => {
    if (!canSave || upsert.isPending) return;
    const finalOwner = owner.trim() || "_global";
    upsert.mutate(
      {
        owner: finalOwner,
        slug: effectiveSlug,
        title: title.trim(),
        category,
        body: "",
      },
      {
        onSuccess: () => {
          onCreated({ owner: finalOwner, slug: effectiveSlug });
          onClose();
        },
      },
    );
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      onEnter={handleSave}
      title="New doc"
      footer={
        <div className="flex items-center justify-end gap-[8px]">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSave || upsert.isPending} onClick={handleSave}>
            {upsert.isPending ? "Creating…" : "Create"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <Field label="Title">
          <TextInput
            ref={titleRef}
            value={title}
            placeholder="Plan for X…"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Field label="Slug" hint="Filename — derived from the title, or set it yourself">
          <TextInput
            value={effectiveSlug}
            placeholder="plan-for-x"
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(slugify(e.target.value));
            }}
            className="font-mono"
          />
        </Field>

        <Field label="Owner" hint="An agent id, or leave as `_global` for shared docs">
          <TextInput
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="font-mono"
          />
        </Field>

        <Field label="Category">
          <CategoryPicker value={category} onChange={setCategory} />
        </Field>

        {upsert.error ? (
          <p className="text-[12px] text-[var(--error)]">{(upsert.error as Error).message}</p>
        ) : null}
      </div>
    </ModalShell>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

export function DocsTab() {
  const docsQ = useAgentDocs();
  const [selected, setSelected] = useState<DocSelection | null>(null);
  const [newDocOpen, setNewDocOpen] = useState(false);

  return (
    <div className="flex gap-[14px] flex-1 min-h-0 overflow-hidden">
      <DocsNav
        docs={docsQ.data ?? []}
        selected={selected}
        onSelect={setSelected}
        onNewDoc={() => setNewDocOpen(true)}
      />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-[22px] surface-sheen shadow-[var(--lift)]">
        {selected ? (
          <DocEditor
            key={`${selected.owner}/${selected.slug}`}
            selected={selected}
            onDeleted={() => setSelected(null)}
          />
        ) : (
          <DocEditorEmpty onNewDoc={() => setNewDocOpen(true)} />
        )}
      </div>
      <NewDocModal
        open={newDocOpen}
        onClose={() => setNewDocOpen(false)}
        onCreated={setSelected}
      />
    </div>
  );
}
