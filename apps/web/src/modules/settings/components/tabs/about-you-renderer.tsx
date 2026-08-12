"use client";

/**
 * AboutYouRenderer — splits the user-analyst markdown into its 9 canonical
 * H2 sections and renders each as its own tinted card so the whole thing
 * scans in one glance rather than reading as a wall of prose.
 *
 * Sections that don't match the canonical set fall through to a plain
 * ProseView, so a bad regen never looks completely broken.
 */

import { ProseView } from "@/components/ui/prose-view";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

// ─── Section palette ─────────────────────────────────────────────────────────
// Every canonical section gets an icon + a tint color the border/background
// derive from. Unknown sections render neutral.

interface SectionStyle {
  icon: IconName;
  /** CSS variable name (without --) for the section tint. */
  tint: string;
}

const SECTION_STYLE: Record<string, SectionStyle> = {
  "bottom line": { icon: "identity", tint: "acc" },
  good: { icon: "check", tint: "done" },
  bad: { icon: "zap", tint: "error" },
  interesting: { icon: "eye", tint: "acc" },
  facts: { icon: "code", tint: "txt-3" },
  "conversational skills": { icon: "pen", tint: "acc" },
  // No dedicated --warning token in the theme; fall back to the accent so the
  // section reads warm/attention-getting without introducing a new color.
  "what can be improved": { icon: "refresh", tint: "acc" },
  "red flags": { icon: "shield", tint: "error" },
  "juicy stuff": { icon: "sparkle", tint: "acc" },
};

// ─── Section splitter ────────────────────────────────────────────────────────

interface Section {
  title: string;
  body: string;
  /** Everything before the first H2 (usually the H1 title + timestamp line). */
  isPreamble?: boolean;
}

function splitSections(md: string): Section[] {
  const lines = md.split("\n");
  const sections: Section[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];
  let isPreamble = true;

  const flush = () => {
    const body = currentBody.join("\n").trim();
    if (!body && !currentTitle) return;
    sections.push({
      title: currentTitle,
      body,
      isPreamble,
    });
  };

  for (const line of lines) {
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      flush();
      currentTitle = h2[1]!.trim();
      currentBody = [];
      isPreamble = false;
      continue;
    }
    currentBody.push(line);
  }
  flush();

  // Drop the raw preamble if it's just an H1 + timestamp — the CardHeader
  // already displays those.
  return sections.filter((s) => {
    if (!s.isPreamble) return true;
    const stripped = s.body.replace(/^#\s+.+$/m, "").replace(/^_.*_$/m, "").trim();
    return stripped.length > 0;
  });
}

// ─── Card ────────────────────────────────────────────────────────────────────

function SectionCard({ section }: { section: Section }) {
  const key = section.title.toLowerCase();
  const style = SECTION_STYLE[key];
  const tint = style?.tint ?? "txt-3";
  const icon: IconName = style?.icon ?? "sparkle";

  // Bottom line renders taller and centered — it's the summary.
  const isBottom = key === "bottom line";

  return (
    <div
      className={cn(
        "rounded-[12px] border p-[16px] flex flex-col gap-[8px]",
        isBottom
          ? "bg-[color-mix(in_oklch,var(--acc)_5%,var(--bg-1))] border-[color-mix(in_oklch,var(--acc)_25%,var(--line))]"
          : "bg-bg-1 border-line",
      )}
    >
      <div className="flex items-center gap-[8px]">
        <span
          className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center shrink-0"
          style={{
            backgroundColor: `color-mix(in oklch, var(--${tint}) 15%, transparent)`,
            color: `var(--${tint})`,
          }}
        >
          <Icon name={icon} size={12} />
        </span>
        <h3
          className={cn(
            "m-0 font-semibold tracking-[-0.005em]",
            isBottom ? "text-[15px]" : "text-[13px]",
          )}
          style={{ color: `var(--${tint === "txt-3" ? "txt" : tint})` }}
        >
          {section.title}
        </h3>
      </div>
      <div className="pl-[30px] text-[13px] text-txt-2 leading-[1.55]">
        <ProseView body={section.body} />
      </div>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export function AboutYouRenderer({ markdown }: { markdown: string }) {
  const sections = splitSections(markdown);

  // If we couldn't extract any H2 sections, fall back to plain prose so the
  // user still sees their content even if the agent went off-script.
  if (sections.length === 0 || (sections.length === 1 && sections[0]!.isPreamble)) {
    return (
      <div className="p-4 ao-prose">
        <ProseView body={markdown} />
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-[10px]">
      {sections.map((s, i) =>
        s.isPreamble ? (
          <div key={`p${i}`} className="ao-prose text-txt-3 text-[12px]">
            <ProseView body={s.body} />
          </div>
        ) : (
          <SectionCard key={s.title || i} section={s} />
        ),
      )}
    </div>
  );
}
