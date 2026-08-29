"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { type MemoryScope } from "@/modules/memory/hooks/use-memory";
import { ScopeEditor } from "@/modules/memory/components/scope-editor";
import { MemoryNav } from "@/modules/memory/components/memory-nav";
import { DocsTab } from "@/modules/memory/components/docs-tab";
import { scopeKey } from "@/modules/memory/scope/scope";

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
            ? "global, project & agent memory"
            : "agent-authored context, plans & postmortems"
        }
        actions={<TabSwitcher tab={tab} onChange={setTab} />}
      />
      <div className="flex-1 min-h-0 flex flex-col pt-[20px] px-[20px] pb-[20px] overflow-hidden">
        {tab === "memory" ? (
          <div className="flex gap-[14px] flex-1 min-h-0 overflow-hidden">
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
      </div>
    </>
  );
}

function TabSwitcher({ tab, onChange }: { tab: TopTab; onChange: (t: TopTab) => void }) {
  return (
    <div className="flex items-center gap-[2px] p-[5px] rounded-[16px] surface-sheen shadow-[var(--lift)]">
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
        "py-[7px] px-[15px] rounded-[12px] text-[12.5px] font-semibold whitespace-nowrap cursor-pointer transition-[filter] duration-150",
        active
          ? "bg-[linear-gradient(120deg,var(--acc-cta),var(--acc-2))] text-white shadow-[0_8px_18px_-10px_rgba(139,123,255,0.8)]"
          : "bg-transparent text-txt-3 hover:brightness-110",
      )}
    >
      {children}
    </button>
  );
}
