"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Portal } from "@/components/ui/portal";
import { Icon } from "@/components/ui/icon";
import type { SkillManifestEntry } from "@/modules/skills/hooks/use-skills";
import { SkillSuggestionRow } from "./skill-suggestion-row";
import { filterSkillEntries } from "./skill-format";

export type SkillAutocompleteInputProps = {
  value: string;
  onChange: (v: string) => void;
  selected: string[];
  onAdd: (slug: string) => void;
  onRemove: (slug: string) => void;
  /** Commits whatever's typed as a free-text chip (preserves power-user path). */
  onFreeTextCommit: () => void;
  manifest: SkillManifestEntry[];
  loading: boolean;
  hasChips: boolean;
};

/**
 * Suggestion-driven chip input. Preserves the existing free-text-add path
 * (Enter/comma commits whatever the user typed) so power users who know
 * slugs by heart still get one-tap adds; opens a dropdown of matching
 * manifest entries for everyone else. Substring match across slug +
 * description + category mirrors the pattern used in command-palette.
 *
 * Combobox pattern per ARIA APG: the <input> owns the combobox role, the
 * dropdown gets listbox, and each row gets option + aria-selected. We wire
 * aria-activedescendant instead of moving DOM focus so the input stays
 * active for typing.
 */
export function SkillAutocompleteInput(props: SkillAutocompleteInputProps) {
  const { value, onChange, selected, onAdd, onRemove, onFreeTextCommit, manifest, loading, hasChips } = props;
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useRef(`skill-listbox-${Math.random().toString(36).slice(2, 8)}`).current;
  const optionIdPrefix = useRef(`skill-opt-${Math.random().toString(36).slice(2, 8)}`).current;

  const filtered = useMemo(() => filterSkillEntries(manifest, value), [manifest, value]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Clamp active index when the filtered list shrinks.
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered.length, activeIdx]);

  const pos = useDropdownPosition(open, inputRef);
  useOutsideClickToClose(open, inputRef, dropdownRef, () => setOpen(false));

  const pick = (entry: SkillManifestEntry) => {
    if (selectedSet.has(entry.slug)) onRemove(entry.slug);
    else onAdd(entry.slug);
    onChange("");
    setActiveIdx(0);
    inputRef.current?.focus();
  };

  const onKeyDown = makeAutocompleteKeydown({
    open,
    setOpen,
    filteredLength: filtered.length,
    setActiveIdx,
    pickActive: () => { const entry = filtered[activeIdx]; if (entry) pick(entry); },
    onFreeTextCommit,
  });

  const activeId = open && filtered.length > 0 ? `${optionIdPrefix}-${activeIdx}` : undefined;

  return (
    <>
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        className="bg-transparent border-0 outline-none flex-1 min-w-[100px] text-ao-fg-0 font-mono text-[12.5px] placeholder:text-ao-fg-1"
        placeholder={hasChips ? "+ add skill" : "add a skill - frontend-design, research, …"}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIdx(0); }}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <SkillAutocompletePortal
          pos={pos}
          listboxId={listboxId}
          dropdownRef={dropdownRef}
          loading={loading}
          filtered={filtered}
          value={value}
          activeIdx={activeIdx}
          selectedSet={selectedSet}
          optionIdPrefix={optionIdPrefix}
          onPick={pick}
        />
      ) : null}
    </>
  );
}

/** Track the input's on-screen rect so we can anchor a portal-rendered dropdown to it. */
function useDropdownPosition(open: boolean, inputRef: React.RefObject<HTMLInputElement | null>) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      if (!inputRef.current) return;
      const r = inputRef.current.getBoundingClientRect();
      const container = inputRef.current.closest("[data-skill-chip-container]") as HTMLElement | null;
      const anchor = container?.getBoundingClientRect() ?? r;
      setPos({ top: anchor.bottom + 4, left: anchor.left, width: anchor.width });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, inputRef]);
  return pos;
}

/** Close the dropdown when a click lands outside both the input and the dropdown. */
function useOutsideClickToClose(
  open: boolean,
  inputRef: React.RefObject<HTMLInputElement | null>,
  dropdownRef: React.RefObject<HTMLDivElement | null>,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (inputRef.current?.contains(e.target as Node)) return;
      if (dropdownRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, inputRef, dropdownRef, close]);
}

type KeydownConfig = {
  open: boolean;
  setOpen: (v: boolean) => void;
  filteredLength: number;
  setActiveIdx: React.Dispatch<React.SetStateAction<number>>;
  pickActive: () => void;
  onFreeTextCommit: () => void;
};

function makeAutocompleteKeydown(cfg: KeydownConfig): (e: React.KeyboardEvent<HTMLInputElement>) => void {
  return (e) => {
    if (e.key === "ArrowDown") {
      if (!cfg.open) { cfg.setOpen(true); return; }
      if (cfg.filteredLength === 0) return;
      e.preventDefault();
      cfg.setActiveIdx((i) => Math.min(cfg.filteredLength - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      if (!cfg.open || cfg.filteredLength === 0) return;
      e.preventDefault();
      cfg.setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Escape") {
      if (cfg.open) { e.preventDefault(); cfg.setOpen(false); }
      return;
    }
    if (e.key === "Enter" || e.key === ",") {
      if (cfg.open && cfg.filteredLength > 0) {
        e.preventDefault();
        cfg.pickActive();
        return;
      }
      e.preventDefault();
      cfg.onFreeTextCommit();
      cfg.setOpen(false);
    }
  };
}

/** The portal-rendered dropdown itself. */
function SkillAutocompletePortal(props: {
  pos: { top: number; left: number; width: number };
  listboxId: string;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  loading: boolean;
  filtered: SkillManifestEntry[];
  value: string;
  activeIdx: number;
  selectedSet: Set<string>;
  optionIdPrefix: string;
  onPick: (entry: SkillManifestEntry) => void;
}) {
  return (
    <Portal>
      <div
        ref={props.dropdownRef}
        id={props.listboxId}
        role="listbox"
        aria-label="Available skills"
        className="fixed z-[300] bg-ao-bg-1 border border-ao-line-2 rounded-[var(--ao-radius-md)] shadow-[var(--ao-shadow-modal)] p-1 max-h-[280px] overflow-y-auto flex flex-col gap-[1px]"
        style={{ top: props.pos.top, left: props.pos.left, width: props.pos.width }}
      >
        {props.loading ? (
          <div className="flex items-center gap-2 px-[10px] py-[10px] text-ao-fg-2 font-mono text-[12px]">
            <Icon name="refresh" size={12} className="[animation:spin_1s_linear_infinite]" />
            Loading skills…
          </div>
        ) : props.filtered.length === 0 ? (
          <div className="px-[10px] py-[10px] text-ao-fg-2 font-mono text-[12px]">
            {props.value.trim()
              ? <>No matching skills — press <span className="text-ao-fg-0">Enter</span> to add anyway</>
              : "No skills available"}
          </div>
        ) : (
          props.filtered.map((entry, i) => (
            <SkillSuggestionRow
              key={entry.slug}
              id={`${props.optionIdPrefix}-${i}`}
              entry={entry}
              active={i === props.activeIdx}
              selected={props.selectedSet.has(entry.slug)}
              onPick={() => props.onPick(entry)}
            />
          ))
        )}
      </div>
    </Portal>
  );
}
