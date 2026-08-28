import type { TableAlign } from "@/lib/markdown";

export type TableBlockProps = {
  header: string[];
  align: TableAlign[];
  rows: string[][];
  /** Renders inline formatting (bold/italic/code) inside a cell as HTML. */
  inlineMd: (s: string) => string;
};

const ALIGN_CLASS: Record<NonNullable<TableAlign> | "none", string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
  none: "text-left",
};

/** GFM table renderer shared by every markdown surface (chat prose, docs
 *  preview, run detail, About You). Deliberately dumb — no sorting/resizing,
 *  just a clean, scrollable, theme-token-driven table. */
export function TableBlock({ header, align, rows, inlineMd }: TableBlockProps) {
  return (
    <div className="my-[10px] overflow-x-auto rounded-[10px] border border-[var(--line)]">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th
                key={i}
                className={`${ALIGN_CLASS[align[i] ?? "none"]} whitespace-nowrap border-b border-[var(--line)] bg-[var(--bg-2)] px-[12px] py-[8px] font-semibold text-[var(--txt-2)]`}
                dangerouslySetInnerHTML={{ __html: inlineMd(cell) }}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="last:[&>td]:border-b-0">
              {header.map((_, ci) => (
                <td
                  key={ci}
                  className={`${ALIGN_CLASS[align[ci] ?? "none"]} border-b border-[var(--line)] px-[12px] py-[8px] leading-[1.55] text-[var(--txt)]`}
                  dangerouslySetInnerHTML={{ __html: inlineMd(row[ci] ?? "") }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
