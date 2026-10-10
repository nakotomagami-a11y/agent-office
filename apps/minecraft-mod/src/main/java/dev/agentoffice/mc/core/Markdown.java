package dev.agentoffice.mc.core;

import java.util.ArrayList;
import java.util.List;
import java.util.function.UnaryOperator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The chat's markdown, parsed exactly like Agent Office's web chat so both show the same thing:
 * {@code splitProse} (apps/web/src/lib/markdown.ts), the block grouping of {@code ProseBlock}
 * (message-bubble.tsx) and {@code inlineMd} (message-format.ts). Only deviation: list items may be
 * indented (nested lists render as indented items instead of being glued into a paragraph).
 */
public final class Markdown {
    private Markdown() {}

    public enum Align { LEFT, CENTER, RIGHT, NONE }

    /** What {@link #splitProse} yields: a raw prose line, a fenced code block or a table. */
    public sealed interface Item permits Line, Code, Table {}

    public record Line(String text) implements Item {}

    public record Code(String lang, String body) implements Item, Block {}

    public record Table(List<String> header, List<Align> align, List<List<String>> rows) implements Item, Block {}

    /** What a message renders as. */
    public sealed interface Block permits Heading, Paragraph, ListBlock, Code, Table {}

    public record Heading(String text) implements Block {}

    public record Paragraph(String text) implements Block {}

    /** {@code marker} is "•" for a bullet, or the number as written ("3.") for a numbered item. */
    public record ListItem(int depth, String marker, String text) {}

    public record ListBlock(boolean ordered, List<ListItem> items) implements Block {}

    /** A run of inline text with one style; {@code link} is the target URL or null. */
    public record Span(String text, boolean code, boolean bold, boolean italic, String link) {
        Span with(String newText, UnaryOperator<Span> style) {
            return style.apply(new Span(newText, code, bold, italic, link));
        }
    }

    private static final Pattern FENCE = Pattern.compile("```(\\w*)\\n([\\s\\S]*?)```");
    // Unclosed fence → code block (CommonMark). JS `$` without the m flag is Java's `\z`.
    private static final Pattern OPEN_FENCE = Pattern.compile("(?:^|\\n)```(\\w*)[^\\S\\n]*\\n([\\s\\S]*)\\z");
    private static final Pattern PARTIAL_FENCE_TAIL = Pattern.compile("(?:^|\\n)`{2,3}\\w*\\z");
    private static final Pattern TABLE_SEPARATOR = Pattern.compile("^\\|?\\s*:?-+:?\\s*(\\|\\s*:?-+:?\\s*)*\\|?$");
    private static final Pattern HEADING = Pattern.compile("^#{2,3}\\s+");
    private static final Pattern BULLET = Pattern.compile("^(\\s*)[-*]\\s+");
    private static final Pattern NUMBERED = Pattern.compile("^(\\s*)(\\d+)\\.\\s+");

    private static final Pattern INLINE_CODE = Pattern.compile("`([^`]+)`");
    private static final Pattern BOLD = Pattern.compile("\\*\\*([^*]+)\\*\\*");
    private static final Pattern ITALIC = Pattern.compile("\\*([^*]+)\\*");
    private static final Pattern LINK = Pattern.compile("\\[([^\\]]+)\\]\\(([^)\\s]+)\\)");

    /** Split text into prose lines, fenced code blocks and GFM tables. Safe on every streaming prefix. */
    public static List<Item> splitProse(String text) {
        List<Item> lines = new ArrayList<>();
        Matcher m = FENCE.matcher(text);
        int last = 0;
        while (m.find()) {
            if (m.start() > last) addLines(lines, text.substring(last, m.start()));
            lines.add(new Code(m.group(1).isEmpty() ? "text" : m.group(1), stripOne(m.group(2), "\n")));
            last = m.end();
        }
        if (last < text.length()) {
            String tail = text.substring(last);
            Matcher open = OPEN_FENCE.matcher(tail);
            if (open.find()) {
                int index = open.start() == 0 ? 0 : open.start() + 1;
                addLines(lines, tail.substring(0, index));
                String body = open.group(2).replaceFirst("\\n`{1,2}\\z", "");
                lines.add(new Code(open.group(1).isEmpty() ? "text" : open.group(1), stripOne(body, "\n")));
            } else {
                addLines(lines, PARTIAL_FENCE_TAIL.matcher(tail).replaceFirst(""));
            }
        }
        return mergeTables(lines);
    }

    /** The blocks a message renders as (ProseBlock): headings, paragraphs, lists, code, tables. */
    public static List<Block> blocks(String text) {
        List<Block> out = new ArrayList<>();
        List<String> para = new ArrayList<>();
        List<ListItem> list = new ArrayList<>();
        boolean[] ordered = {false};
        Runnable flushPara = () -> {
            if (para.isEmpty()) return;
            out.add(new Paragraph(String.join(" ", para)));
            para.clear();
        };
        Runnable flushList = () -> {
            if (list.isEmpty()) return;
            out.add(new ListBlock(ordered[0], List.copyOf(list)));
            list.clear();
        };
        for (Item item : splitProse(text)) {
            if (item instanceof Code c) {
                flushPara.run();
                flushList.run();
                out.add(c);
                continue;
            }
            if (item instanceof Table t) {
                flushPara.run();
                flushList.run();
                out.add(t);
                continue;
            }
            String ln = ((Line) item).text();
            Matcher bullet = BULLET.matcher(ln);
            Matcher numbered = NUMBERED.matcher(ln);
            if (HEADING.matcher(ln).find()) {
                flushPara.run();
                flushList.run();
                out.add(new Heading(HEADING.matcher(ln).replaceFirst("")));
            } else if (bullet.find()) {
                flushPara.run();
                if (list.isEmpty()) ordered[0] = false;
                list.add(new ListItem(depth(bullet.group(1)), "•", ln.substring(bullet.end())));
            } else if (numbered.find()) {
                flushPara.run();
                if (list.isEmpty()) ordered[0] = true;
                list.add(new ListItem(depth(numbered.group(1)), numbered.group(2) + ".", ln.substring(numbered.end())));
            } else if (ln.trim().isEmpty()) {
                flushPara.run();
                flushList.run();
            } else {
                flushList.run();
                para.add(ln);
            }
        }
        flushPara.run();
        flushList.run();
        return out;
    }

    /** Private-use characters standing in for inline code spans while bold/italic/links are matched. */
    private static final char PLACEHOLDER = '';
    private static final int MAX_PLACEHOLDERS = 0x1000;

    /**
     * Inline styles in inlineMd's order: code, bold, italic, links. inlineMd works on one string, so
     * bold and links may span code ({@code **see `x` here**}, {@code [`a.ts`](url)}): each code span
     * becomes a placeholder character while the others match, then turns back into a code span that
     * inherits the styles around it. Code content itself is never styled.
     */
    public static List<Span> inline(String s) {
        List<String> codes = new ArrayList<>();
        StringBuilder masked = new StringBuilder();
        Matcher code = INLINE_CODE.matcher(s);
        int last = 0;
        while (codes.size() < MAX_PLACEHOLDERS && code.find()) {
            masked.append(s, last, code.start()).append((char) (PLACEHOLDER + codes.size()));
            codes.add(code.group(1));
            last = code.end();
        }
        masked.append(s, last, s.length());
        List<Span> spans = List.of(new Span(masked.toString(), false, false, false, null));
        spans = apply(spans, BOLD, (sp, m) -> sp.with(m.group(1), x -> new Span(x.text(), x.code(), true, x.italic(), x.link())));
        spans = apply(spans, ITALIC, (sp, m) -> sp.with(m.group(1), x -> new Span(x.text(), x.code(), x.bold(), true, x.link())));
        spans = apply(spans, LINK, (sp, m) -> sp.with(m.group(1), x -> new Span(x.text(), x.code(), x.bold(), x.italic(), unmask(m.group(2), codes))));
        List<Span> out = new ArrayList<>();
        for (Span sp : spans) {
            StringBuilder plain = new StringBuilder();
            for (int i = 0; i < sp.text().length(); i++) {
                char ch = sp.text().charAt(i);
                int index = ch - PLACEHOLDER;
                if (index >= 0 && index < codes.size()) {
                    if (!plain.isEmpty()) out.add(sp.with(plain.toString(), x -> x));
                    plain.setLength(0);
                    out.add(new Span(codes.get(index), true, sp.bold(), sp.italic(), sp.link()));
                } else {
                    plain.append(ch);
                }
            }
            if (!plain.isEmpty()) out.add(sp.with(plain.toString(), x -> x));
        }
        return out;
    }

    /** A link target with its masked code spans put back as their backticked source. */
    private static String unmask(String target, List<String> codes) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < target.length(); i++) {
            int index = target.charAt(i) - PLACEHOLDER;
            if (index >= 0 && index < codes.size()) out.append('`').append(codes.get(index)).append('`');
            else out.append(target.charAt(i));
        }
        return out.toString();
    }

    private interface Styler {
        Span apply(Span source, Matcher match);
    }

    /** Splits every span on the pattern; matches become styled spans. */
    private static List<Span> apply(List<Span> spans, Pattern p, Styler styler) {
        List<Span> out = new ArrayList<>();
        for (Span sp : spans) {
            Matcher m = p.matcher(sp.text());
            int last = 0;
            while (m.find()) {
                if (m.start() > last) out.add(sp.with(sp.text().substring(last, m.start()), x -> x));
                out.add(styler.apply(sp, m));
                last = m.end();
            }
            if (last < sp.text().length()) out.add(last == 0 ? sp : sp.with(sp.text().substring(last), x -> x));
        }
        return out;
    }

    private static int depth(String indent) {
        return indent.replace("\t", "  ").length() / 2;
    }

    private static void addLines(List<Item> lines, String chunk) {
        for (String line : chunk.split("\n", -1)) lines.add(new Line(line));
    }

    private static String stripOne(String s, String suffix) {
        return s.endsWith(suffix) ? s.substring(0, s.length() - suffix.length()) : s;
    }

    private static boolean isTableSeparatorRow(String line) {
        String t = line.trim();
        if (!t.contains("-") || !t.contains("|")) return false;
        return TABLE_SEPARATOR.matcher(t).matches();
    }

    private static List<String> splitTableRow(String line) {
        String t = line.trim();
        if (t.startsWith("|")) t = t.substring(1);
        if (t.endsWith("|")) t = t.substring(0, t.length() - 1);
        List<String> cells = new ArrayList<>();
        for (String cell : t.split("\\|", -1)) cells.add(cell.trim());
        return cells;
    }

    private static Align alignOf(String cell) {
        String t = cell.trim();
        if (t.startsWith(":") && t.endsWith(":")) return Align.CENTER;
        if (t.endsWith(":")) return Align.RIGHT;
        if (t.startsWith(":")) return Align.LEFT;
        return Align.NONE;
    }

    /** Merge a run of header / separator / data lines into one table item. */
    private static List<Item> mergeTables(List<Item> lines) {
        List<Item> out = new ArrayList<>();
        for (int i = 0; i < lines.size(); i++) {
            Item item = lines.get(i);
            Item next = i + 1 < lines.size() ? lines.get(i + 1) : null;
            boolean tableStart = item instanceof Line l && l.text().contains("|")
                    && next instanceof Line n && isTableSeparatorRow(n.text());
            if (!tableStart) {
                out.add(item);
                continue;
            }
            List<String> header = splitTableRow(((Line) item).text());
            List<Align> align = splitTableRow(((Line) next).text()).stream().map(Markdown::alignOf).toList();
            List<List<String>> rows = new ArrayList<>();
            int j = i + 2;
            for (; j < lines.size(); j++) {
                if (!(lines.get(j) instanceof Line row) || row.text().trim().isEmpty() || !row.text().contains("|")) break;
                rows.add(splitTableRow(row.text()));
            }
            out.add(new Table(header, align, rows));
            i = j - 1;
        }
        return out;
    }
}
