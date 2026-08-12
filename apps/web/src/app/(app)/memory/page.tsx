"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { type MemoryScope } from "@/modules/memory/hooks/use-memory";
import { ScopeEditor } from "@/modules/memory/components/scope-editor";
import { MemoryNav } from "@/modules/memory/components/memory-nav";
import { DocsTab } from "@/modules/memory/components/docs-tab";
import { scopeKey } from "@/modules/memory/scope/scope";
import { cn } from "@/lib/cn";

type TopTab = "memory" | "docs";

export default function MemoryPage() {
  const t = useTranslations("memory_page");
  const [tab, setTab] = useState<TopTab>("memory");
  const [scope, setScope] = useState<MemoryScope>({ kind: "global" });
  const [contentMap, setContentMap] = useState<Map<string, boolean>>(new Map());

  const handleContentLoaded = useCallback((key: string, hasContent: boolean) => {
    setContentMap((prev) => {
      if (prev.get(key) === hasContent) return prev;
      const next = new Map(prev);
      next.set(key, hasContent);
      return next;
    });
  }, []);

  return (
    <>
      <PageHeader
        title={t("title")}
        sub={
          tab === "memory"
            ? "· global, project & agent memory"
            : "· agent-authored context, plans & postmortems"
        }
        actions={<TabSwitcher tab={tab} onChange={setTab} />}
      />
      {tab === "memory" ? (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <MemoryNav selected={scope} onSelect={setScope} contentMap={contentMap} />
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <ScopeEditor
              key={scopeKey(scope)}
              scope={scope}
              onContentLoaded={handleContentLoaded}
            />
          </div>
        </div>
      ) : (
        <DocsTab />
      )}
    </>
  );
}

function TabSwitcher({ tab, onChange }: { tab: TopTab; onChange: (t: TopTab) => void }) {
  return (
    <div className="flex items-center gap-[2px] p-[2px] bg-bg-2 border border-line rounded-[7px]">
      <TabButton active={tab === "memory"} onClick={() => onChange("memory")}>
        Memory
      </TabButton>
      <TabButton active={tab === "docs"} onClick={() => onChange("docs")}>
        Docs
      </TabButton>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-[10px] h-[24px] rounded-[5px] text-[12px] font-medium cursor-pointer border-none [font:inherit] transition-[background,color] duration-[80ms]",
        active
          ? "bg-bg-1 text-txt shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
          : "bg-transparent text-txt-2 hover:text-txt",
      )}
    >
      {children}
    </button>
  );
}
