"use client";

/**
 * Docs tab — long-form agent-authored context files.
 *
 * Layout:
 *   [ Nav ]  |  [ Editor ]
 *
 * Nav is grouped by DocCategory, with per-owner (agent-id or `_global`)
 * sub-items. Selecting a doc loads it into the editor pane; the editor pane
 * also exposes a "New doc" flow that authors a fresh file under a chosen
 * owner + category.
 *
 * A doc is NOT the same as a memory file — memory is a small always-injected
 * note; docs are the architecture write-ups, plans, and postmortems agents
 * accumulate so the workspace builds up institutional memory. Agents write
 * these via `PUT /api/agent-docs/[owner]/[slug]`; users can edit and delete
 * them here.
 */

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
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
    <div className="flex flex-col">
      <div className="flex items-center h-[20px] mt-[10px] mb-[1px] px-[8px] text-[9.5px] font-semibold tracking-[0.1em] uppercase text-txt-4 select-none gap-[6px]">
        <Icon name={CATEGORY_ICON[category]} size={10} />
        {category}
      </div>
      {docs.map((d) => {
        const isSelected =
          selected?.owner === d.owner && selected?.slug === d.slug;
        return (
          <button
            key={`${d.owner}/${d.slug}`}
            type="button"
            onClick={() => onSelect({ owner: d.owner, slug: d.slug })}
            className={cn(
              "flex flex-col gap-[2px] w-full py-[4px] pl-5 pr-2 text-left cursor-pointer border-none font-[inherit] transition-colors duration-[80ms]",
              isSelected
                ? "bg-acc-faint [box-shadow:inset_2px_0_0_var(--acc)]"
                : "bg-transparent hover:bg-bg-3 [box-shadow:inset_2px_0_0_transparent]",
            )}
          >
            <span
              className={cn(
                "text-[12px] leading-tight overflow-hidden text-ellipsis whitespace-nowrap",
                isSelected ? "text-acc font-medium" : "text-txt-2",
              )}
            >
              {d.title}
            </span>
            <span className="text-[10px] font-mono text-txt-4 overflow-hidden text-ellipsis whitespace-nowrap">
              {d.owner === "_global" ? "global" : d.owner}
            </span>
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
    <div className="w-[240px] shrink-0 border-r border-line bg-bg-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-[6px] px-[10px] py-[8px] border-b border-line">
        <Button size="sm" variant="ghost" className="w-full" onClick={onNewDoc}>
          <Icon name="sparkle" size={12} /> New doc
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-[6px]">
        {docs.length === 0 ? (
          <div className="px-[12px] py-[12px] text-[12px] text-txt-3 leading-relaxed">
            No docs yet. Agents write here via <code className="font-mono text-[11px] bg-bg-2 px-[3px] py-[1px] rounded">PUT /api/agent-docs/&lt;owner&gt;/&lt;slug&gt;</code>, or use the New doc button.
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

  if (docQ.isPending) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-[24px] w-[240px]" />
        <Skeleton className="h-[240px] w-full" />
      </div>
    );
  }
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
      <div className="flex items-baseline gap-[10px] px-6 pt-6 pb-3 border-b border-line">
        <h2 className="text-[16px] font-semibold text-txt m-0">{doc.title}</h2>
        <span className="text-[11px] font-mono text-txt-3">
          {doc.category} · {doc.owner === "_global" ? "global" : doc.owner}
        </span>
        <button
          type="button"
          className="ml-auto text-[11.5px] text-txt-3 hover:text-[var(--error)] cursor-pointer bg-transparent border-none [font:inherit]"
          onClick={() => {
            if (!confirm(`Delete "${doc.title}"?`)) return;
            del.mutate(
              { owner: doc.owner, slug: doc.slug },
              { onSuccess: onDeleted },
            );
          }}
          disabled={del.isPending}
        >
          Delete
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
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
        />
      </div>
    </div>
  );
}

function DocEditorEmpty({ onNewDoc }: { onNewDoc: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
      <Icon name="book" size={28} className="text-txt-4" />
      <div className="text-[13px] text-txt-2">
        Select a doc, or start a new one.
      </div>
      <Button size="sm" variant="primary" onClick={onNewDoc}>
        New doc
      </Button>
    </div>
  );
}

// ── New-doc modal ────────────────────────────────────────────────────────────

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
      <div className="w-full max-w-[420px] flex flex-col gap-[10px] border border-line rounded-[10px] bg-bg-1 p-4">
        <div className="text-[13px] font-semibold text-txt">New doc</div>
        <label className="flex flex-col gap-[4px] text-[11.5px] text-txt-2">
          Title
          <input
            type="text"
            value={draft.title}
            placeholder="Plan for X…"
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            className="h-[30px] px-[10px] bg-bg-2 border border-line-2 rounded-[7px] text-txt text-[12.5px] outline-none [font:inherit] focus:border-[var(--acc)]"
          />
        </label>
        <label className="flex flex-col gap-[4px] text-[11.5px] text-txt-2">
          Slug (filename, no spaces)
          <input
            type="text"
            value={draft.slug}
            placeholder="plan-for-x"
            onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
            className="h-[30px] px-[10px] bg-bg-2 border border-line-2 rounded-[7px] text-txt text-[12.5px] font-mono outline-none focus:border-[var(--acc)]"
          />
        </label>
        <label className="flex flex-col gap-[4px] text-[11.5px] text-txt-2">
          Owner (agent-id, or leave `_global` for shared docs)
          <input
            type="text"
            value={draft.owner}
            onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}
            className="h-[30px] px-[10px] bg-bg-2 border border-line-2 rounded-[7px] text-txt text-[12.5px] font-mono outline-none focus:border-[var(--acc)]"
          />
        </label>
        <label className="flex flex-col gap-[4px] text-[11.5px] text-txt-2">
          Category
          <select
            value={draft.category}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                category: e.target.value as DocCategory,
              }))
            }
            className="h-[30px] px-[8px] bg-bg-2 border border-line-2 rounded-[7px] text-txt text-[12.5px] [font:inherit] cursor-pointer"
          >
            {DOC_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-[6px] justify-end mt-1">
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!canSave || upsert.isPending}
            onClick={handleSave}
          >
            {upsert.isPending ? "Creating…" : "Create"}
          </Button>
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
    <div className="flex flex-1 min-h-0 overflow-hidden">
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
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
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
