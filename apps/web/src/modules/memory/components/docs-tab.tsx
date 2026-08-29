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
 * them here.
 */

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { ACCENT_BTN, Button } from "@/components/ui/button";
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

// ── Nav ──────────────────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<DocCategory, "sparkle" | "code" | "pen" | "hammer" | "book" | "search"> = {
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
  const grouped = useMemo(() => {
    const out: Record<DocCategory, DocMeta[]> = {
      architecture: [],
      plan: [],
      notes: [],
      postmortem: [],
      context: [],
      reference: [],
    };
    for (const d of docs) out[d.category].push(d);
    return out;
  }, [docs]);

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
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-[12px] pb-[12px] flex flex-col gap-[1px]">
        {docs.length === 0 ? (
          <div className="px-[9px] py-[10px] text-[11.5px] text-txt-3 leading-relaxed">
            No docs yet. Agents write here via{" "}
            <code className="font-[var(--font-mono)] text-[10.5px] bg-card-2 px-[4px] py-[1px] rounded-[4px]">
              PUT /api/agent-docs/&lt;owner&gt;/&lt;slug&gt;
            </code>
            , or use the New doc button.
          </div>
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

// ── Editor pane ──────────────────────────────────────────────────────────────

interface DraftMeta {
  owner: string;
  slug: string;
  title: string;
  category: DocCategory;
}

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
      <div className="shrink-0 flex items-center gap-[12px] px-[20px] py-[14px] border-b border-edge">
        <span className="text-[15.5px] font-bold overflow-hidden text-ellipsis whitespace-nowrap">{doc.title}</span>
        <span className="flex-1" />
        <span className="font-[var(--font-mono)] text-[10.5px] text-txt-4 whitespace-nowrap">
          {doc.category} · {doc.owner === "_global" ? "global" : doc.owner}
        </span>
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

// ── New-doc form ─────────────────────────────────────────────────────────────

function NewDocForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (sel: DocSelection) => void;
}) {
  const upsert = useUpsertAgentDoc();
  const [draft, setDraft] = useState<DraftMeta>({
    owner: "_global",
    slug: "",
    title: "",
    category: "notes",
  });

  const canSave =
    draft.slug.trim().length > 0 &&
    draft.title.trim().length > 0 &&
    /^[A-Za-z0-9._-]+$/.test(draft.slug);

  const handleSave = () => {
    if (!canSave || upsert.isPending) return;
    const owner = draft.owner.trim() || "_global";
    upsert.mutate(
      {
        owner,
        slug: draft.slug.trim(),
        title: draft.title.trim(),
        category: draft.category,
        body: "",
      },
      {
        onSuccess: () => onCreated({ owner, slug: draft.slug.trim() }),
      },
    );
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-[420px] flex flex-col gap-[12px] rounded-[18px] bg-card-2 border border-edge shadow-[var(--inset-hi)] p-[18px]">
        <div className="text-[14px] font-bold text-txt">New doc</div>
        <label className="flex flex-col gap-[5px] text-[11.5px] text-txt-2">
          Title
          <input
            type="text"
            value={draft.title}
            placeholder="Plan for X…"
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            className="h-[34px] px-[12px] bg-card border border-edge rounded-[10px] text-txt text-[12.5px] outline-none [font:inherit] focus:border-[var(--acc)]"
          />
        </label>
        <label className="flex flex-col gap-[5px] text-[11.5px] text-txt-2">
          Slug (filename, no spaces)
          <input
            type="text"
            value={draft.slug}
            placeholder="plan-for-x"
            onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
            className="h-[34px] px-[12px] bg-card border border-edge rounded-[10px] text-txt text-[12.5px] font-[var(--font-mono)] outline-none focus:border-[var(--acc)]"
          />
        </label>
        <label className="flex flex-col gap-[5px] text-[11.5px] text-txt-2">
          Owner (agent-id, or leave `_global` for shared docs)
          <input
            type="text"
            value={draft.owner}
            onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
            className="h-[34px] px-[12px] bg-card border border-edge rounded-[10px] text-txt text-[12.5px] font-[var(--font-mono)] outline-none focus:border-[var(--acc)]"
          />
        </label>
        <label className="flex flex-col gap-[5px] text-[11.5px] text-txt-2">
          Category
          <select
            value={draft.category}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                category: e.target.value as DocCategory,
              }))
            }
            className="h-[34px] px-[10px] bg-card border border-edge rounded-[10px] text-txt text-[12.5px] [font:inherit] cursor-pointer"
          >
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-[8px] justify-end mt-[4px]">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <button
            type="button"
            disabled={!canSave || upsert.isPending}
            onClick={handleSave}
            className={cn(ACCENT_BTN, "py-[9px] px-[16px] rounded-[11px] text-[12.5px] font-bold")}
          >
            {upsert.isPending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

export function DocsTab() {
  const docsQ = useAgentDocs();
  const [selected, setSelected] = useState<DocSelection | null>(null);
  const [showNew, setShowNew] = useState(false);

  return (
    <div className="flex gap-[14px] flex-1 min-h-0 overflow-hidden">
      <DocsNav
        docs={docsQ.data ?? []}
        selected={selected}
        onSelect={(sel) => {
          setShowNew(false);
          setSelected(sel);
        }}
        onNewDoc={() => {
          setSelected(null);
          setShowNew(true);
        }}
      />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-[22px] surface-sheen shadow-[var(--lift)]">
        {showNew ? (
          <NewDocForm
            onCancel={() => setShowNew(false)}
            onCreated={(sel) => {
              setShowNew(false);
              setSelected(sel);
            }}
          />
        ) : selected ? (
          <DocEditor
            key={`${selected.owner}/${selected.slug}`}
            selected={selected}
            onDeleted={() => setSelected(null)}
          />
        ) : (
          <DocEditorEmpty onNewDoc={() => setShowNew(true)} />
        )}
      </div>
    </div>
  );
}
