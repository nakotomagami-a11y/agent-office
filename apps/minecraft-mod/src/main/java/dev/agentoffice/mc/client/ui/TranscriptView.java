package dev.agentoffice.mc.client.ui;

import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Images;
import dev.agentoffice.mc.core.Markdown;
import dev.agentoffice.mc.core.Transcript;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Supplier;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.util.FormattedCharSequence;

/**
 * Draws a chat thread the way Agent Office's web chat does: message cards, markdown blocks (headings,
 * lists, fenced code, tables), grouped tool rows, a done divider with usage, error cards and image
 * previews. Layout is cached per item (items are immutable; a streamed reply replaces its item).
 */
public final class TranscriptView {
    private static final int LINE = 11;
    private static final int ITEM_GAP = 7;
    private static final int SCROLLBAR = 4;

    private final Font font;
    private final Supplier<AgentOfficeClient> client;
    private final String agentName;
    private final Consumer<ImageCache.Img> openImage;
    private final Map<Transcript.Item, Laid> cache = new IdentityHashMap<>();
    private final List<Hit> hits = new ArrayList<>();
    /** Items, with runs of more than COLLAPSE_THRESHOLD tool calls folded into a {@link Chain}. */
    private List<Object> rows = List.of();
    private final Set<String> openChains = new HashSet<>();
    private int x;
    private int y;
    private int w;
    private int h;
    private int scrollFromBottom;
    /** From the last frame, so consecutive scrolls clamp before the next render. */
    private int maxScroll;
    /** Content height of the last frame: keeps what the reader looks at in place while text streams in. */
    private int lastTotal;

    private record Laid(boolean labeled, int width, List<Part> parts) {}

    private record Hit(Part part, int x, int y, int w, int h) {}

    /** Same as the web chat (tool-group-row.tsx): runs over COLLAPSE_THRESHOLD hide behind "N tool calls". */
    private static final int COLLAPSE_THRESHOLD = 8;

    private record Chain(List<Transcript.Tool> tools) {
        String key() {
            Transcript.Tool first = tools.get(0);
            return first.id() != null && !first.id().isEmpty() ? first.id() : first.name() + "|" + first.arg();
        }
    }

    public TranscriptView(Font font, Supplier<AgentOfficeClient> client, String agentName, Consumer<ImageCache.Img> openImage) {
        this.font = font;
        this.client = client;
        this.agentName = agentName;
        this.openImage = openImage;
    }

    public void setBounds(int x, int y, int w, int h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    public void setItems(List<Transcript.Item> items) {
        List<Object> out = new ArrayList<>();
        List<Transcript.Tool> run = new ArrayList<>();
        for (Transcript.Item i : items) {
            if (i instanceof Transcript.Tool t) {
                run.add(t);
                continue;
            }
            flushTools(run, out);
            out.add(i);
        }
        flushTools(run, out);
        rows = out;
        Map<Transcript.Item, Boolean> keep = new IdentityHashMap<>();
        for (Transcript.Item i : items) keep.put(i, true);
        cache.keySet().removeIf(k -> !keep.containsKey(k));
    }

    public void scroll(double amount) {
        scrollFromBottom = Math.max(0, Math.min(maxScroll, scrollFromBottom + (int) Math.round(amount * LINE * 3)));
    }

    public void scrollToBottom() {
        scrollFromBottom = 0;
    }

    public boolean isMouseOver(double mx, double my) {
        return mx >= x && mx < x + w && my >= y && my < y + h;
    }

    public void render(GuiGraphics g, int mouseX, int mouseY) {
        int cw = w - SCROLLBAR - 2;
        List<List<Part>> laid = new ArrayList<>();
        int total = 0;
        Object prev = null;
        for (Object item : rows) {
            List<Part> parts = layout(item, prev, cw);
            laid.add(parts);
            total += height(parts) + gapBefore(prev, item);
            prev = item;
        }
        if (scrollFromBottom > 0) scrollFromBottom += total - lastTotal;
        lastTotal = total;
        maxScroll = Math.max(0, total - h);
        // Anchoring can overshoot either way when content shrinks (a run settles, a chain folds).
        scrollFromBottom = Math.max(0, Math.min(scrollFromBottom, maxScroll));
        int cy = total <= h ? y : y + h - total + scrollFromBottom;
        hits.clear();
        g.enableScissor(x, y, x + w, y + h);
        prev = null;
        for (int i = 0; i < rows.size(); i++) {
            cy += gapBefore(prev, rows.get(i));
            prev = rows.get(i);
            for (Part p : laid.get(i)) {
                int ph = p.height();
                if (cy + ph >= y && cy <= y + h) {
                    p.render(g, x, cy, cw, mouseX, mouseY);
                    hits.add(new Hit(p, x, cy, cw, ph));
                }
                cy += ph;
            }
        }
        g.disableScissor();
        if (maxScroll > 0) {
            int trackX = x + w - SCROLLBAR;
            g.fill(trackX, y, trackX + SCROLLBAR, y + h, Theme.EDGE);
            int thumbH = Math.max(12, h * h / total);
            int thumbY = y + (int) ((long) (h - thumbH) * (maxScroll - scrollFromBottom) / maxScroll);
            g.fill(trackX, thumbY, trackX + SCROLLBAR, thumbY + thumbH, Theme.BG_4);
        }
    }

    /** The text style under the mouse (links), from the last rendered frame. */
    public Style styleAt(double mx, double my) {
        for (Hit hit : hits) {
            if (my >= hit.y && my < hit.y + hit.h && mx >= hit.x && mx < hit.x + hit.w) {
                return hit.part.styleAt((int) mx - hit.x, (int) my - hit.y);
            }
        }
        return null;
    }

    /** Clicks on images open them; returns true when consumed. */
    public boolean click(double mx, double my) {
        for (Hit hit : hits) {
            if (my >= hit.y && my < hit.y + hit.h && mx >= hit.x && mx < hit.x + hit.w) {
                return hit.part.click((int) mx - hit.x, (int) my - hit.y);
            }
        }
        return false;
    }

    private static void flushTools(List<Transcript.Tool> run, List<Object> out) {
        if (run.isEmpty()) return;
        if (run.size() > COLLAPSE_THRESHOLD) {
            out.add(new Chain(List.copyOf(run)));
        } else {
            out.addAll(run);
        }
        run.clear();
    }

    private static boolean isTools(Object row) {
        return row instanceof Transcript.Tool || row instanceof Chain;
    }

    private static int gapBefore(Object prev, Object item) {
        if (prev == null) return 0;
        if (isTools(prev) && isTools(item)) return 0;
        return ITEM_GAP;
    }

    private static int height(List<Part> parts) {
        int sum = 0;
        for (Part p : parts) sum += p.height();
        return sum;
    }

    private List<Part> layout(Object row, Object prev, int width) {
        if (row instanceof Chain chain) {
            List<Part> parts = new ArrayList<>();
            parts.add(new ChainPart(chain));
            if (openChains.contains(chain.key())) {
                for (Transcript.Tool t : chain.tools()) parts.add(new ToolPart(t));
            }
            return parts;
        }
        Transcript.Item item = (Transcript.Item) row;
        boolean labeled = item instanceof Transcript.AgentText && !(prev instanceof Transcript.AgentText) && !isTools(prev);
        Laid laid = cache.get(item);
        if (laid != null && laid.width == width && laid.labeled == labeled) return laid.parts;
        List<Part> parts = switch (item) {
            case Transcript.You you -> youParts(you, width);
            case Transcript.AgentText text -> agentParts(text, labeled, width);
            case Transcript.Tool tool -> List.of(new ToolPart(tool));
            case Transcript.Done done -> List.of(new DividerPart(doneText(done), done.exitCode() == 0 ? Theme.TXT_4 : Theme.RED));
            case Transcript.Failure f -> List.of(card(0x1AF87171, Theme.RED, width, inner -> {
                List<Part> p = new ArrayList<>();
                p.add(lines(Component.literal("Error · " + errorText(f.code())).withStyle(s -> s.withColor(Theme.RED).withBold(true)), inner, 0));
                if (f.detail() != null) p.add(lines(Component.literal(f.detail()).withColor(Theme.TXT_2), inner, 0));
                return p;
            }));
            case Transcript.Note n -> List.of(lines(Component.literal(n.text())
                    .withStyle(s -> s.withColor(n.warning() ? Theme.AMBER : Theme.TXT_3).withItalic(true)), width, 0));
            case Transcript.SubAgent sub -> List.of(card(Theme.CARD, sub.running() ? Theme.OK : Theme.TXT_4, width, inner -> {
                List<Part> p = new ArrayList<>();
                p.add(lines(Component.literal("↳ " + sub.name()).withStyle(s -> s.withColor(Theme.TXT).withBold(true))
                        .append(Component.literal("  " + sub.status()).withStyle(s -> s.withColor(Theme.TXT_3).withBold(false))), inner, 0));
                String detail = sub.currentTool() != null ? "using " + sub.currentTool() : sub.lastLine();
                if (detail != null) p.add(lines(Component.literal(detail).withColor(Theme.TXT_4), inner, 0));
                return p;
            }));
            case Transcript.RateLimit rl -> List.of(card(0x1AFBBF24, rl.limit() ? Theme.RED : Theme.AMBER, width, inner -> List.of(
                    lines(Component.literal(rl.limit() ? "Rate limit reached" : "Rate limit warning")
                            .withStyle(s -> s.withColor(rl.limit() ? Theme.RED : Theme.AMBER).withBold(true)), inner, 0),
                    lines(Component.literal(rl.message()).withColor(Theme.TXT_2), inner, 0))));
        };
        cache.put(item, new Laid(labeled, width, parts));
        return parts;
    }

    private List<Part> youParts(Transcript.You you, int width) {
        List<Part> out = new ArrayList<>();
        out.add(card(Theme.CARD_2, you.system() ? Theme.AMBER : Theme.ACCENT, width, inner -> {
            List<Part> p = new ArrayList<>();
            p.add(lines(Component.literal(you.system() ? "System" : "You")
                    .withStyle(s -> s.withColor(you.system() ? Theme.AMBER : Theme.ACCENT_SOFT).withBold(true)), inner, 0));
            for (String para : Transcript.stripAttachmentFooter(you.text()).split("\n", -1)) {
                p.add(lines(Component.literal(para).withColor(Theme.TXT), inner, 0));
            }
            return p;
        }));
        for (String path : Images.extract(you.text())) out.add(new ImagePart(path));
        return out;
    }

    private List<Part> agentParts(Transcript.AgentText text, boolean labeled, int width) {
        List<Part> out = new ArrayList<>();
        if (labeled) out.add(lines(Component.literal(agentName).withStyle(s -> s.withColor(Theme.GREEN).withBold(true)), width, 0));
        List<Markdown.Block> blocks = Markdown.blocks(text.text());
        for (int i = 0; i < blocks.size(); i++) {
            if (i > 0) out.add(new Spacer(4));
            switch (blocks.get(i)) {
                case Markdown.Heading hd -> {
                    if (i > 0) out.add(new Spacer(3));
                    out.add(lines(inline(hd.text(), Theme.TXT).withStyle(s -> s.withBold(true)), width, 0));
                }
                case Markdown.Paragraph p -> out.add(lines(inline(p.text(), Theme.TXT), width, 0));
                case Markdown.ListBlock list -> {
                    for (Markdown.ListItem li : list.items()) {
                        out.add(new ListItemPart(li.marker(), li.depth() * 12, inline(li.text(), Theme.TXT), width));
                    }
                }
                case Markdown.Code code -> out.add(new CodePart(code, width));
                case Markdown.Table table -> out.add(new TablePart(table, width));
            }
        }
        if (text.streaming()) out.add(new CursorPart());
        for (String path : Images.extract(text.text())) out.add(new ImagePart(path));
        return out;
    }

    private static String doneText(Transcript.Done d) {
        StringBuilder sb = new StringBuilder(d.exitCode() == 0 ? "done" : "exit " + d.exitCode());
        if (d.durationMs() > 0) sb.append(" · ").append(Transcript.fmtDuration(d.durationMs()));
        if (d.tokensIn() + d.tokensOut() > 0) {
            sb.append(" · ").append(Transcript.fmtTok(d.tokensIn())).append(" in · ").append(Transcript.fmtTok(d.tokensOut())).append(" out");
        }
        if (d.cost() > 0) sb.append(" · ").append(Transcript.fmtCost(d.cost()));
        return sb.toString();
    }

    private static String errorText(String code) {
        return switch (code == null ? "" : code) {
            case "auth_required" -> "Claude isn't logged in";
            case "rate_limited" -> "rate limited";
            case "server_restart" -> "Agent Office restarted during this turn";
            case "unknown", "" -> "this turn failed";
            default -> code.replace('_', ' ');
        };
    }

    /** A message's inline markdown as styled text; code spans use the monospace-ish uniform font. */
    static MutableComponent inline(String text, int color) {
        MutableComponent out = Component.empty();
        for (Markdown.Span s : Markdown.inline(text)) {
            Style st = Style.EMPTY.withColor(color);
            if (s.code()) st = st.withFont(Minecraft.UNIFORM_FONT).withColor(Theme.ACCENT_SOFT);
            if (s.bold()) st = st.withBold(true);
            if (s.italic()) st = st.withItalic(true);
            if (s.link() != null && s.link().matches("(?i)https?://.+")) {
                st = st.withColor(Theme.ACCENT).withUnderlined(true)
                        .withClickEvent(new ClickEvent(ClickEvent.Action.OPEN_URL, s.link()))
                        .withHoverEvent(new HoverEvent(HoverEvent.Action.SHOW_TEXT, Component.literal(s.link())));
            }
            out.append(Component.literal(s.text()).withStyle(st));
        }
        return out;
    }

    // ── parts ────────────────────────────────────────────────────────────────

    private interface Part {
        int height();

        void render(GuiGraphics g, int x, int y, int w, int mouseX, int mouseY);

        default Style styleAt(int rx, int ry) {
            return null;
        }

        default boolean click(int rx, int ry) {
            return false;
        }
    }

    private record Spacer(int height) implements Part {
        @Override
        public void render(GuiGraphics g, int x, int y, int w, int mouseX, int mouseY) {}
    }

    private Part lines(Component text, int width, int indent) {
        return new LinesPart(font.split(text, Math.max(20, width - indent)), indent);
    }

    private final class LinesPart implements Part {
        private final List<FormattedCharSequence> lines;
        private final int indent;

        LinesPart(List<FormattedCharSequence> lines, int indent) {
            this.lines = lines.isEmpty() ? List.of(FormattedCharSequence.EMPTY) : lines;
            this.indent = indent;
        }

        @Override
        public int height() {
            return lines.size() * LINE;
        }

        @Override
        public void render(GuiGraphics g, int x, int y, int w, int mouseX, int mouseY) {
            for (int i = 0; i < lines.size(); i++) g.drawString(font, lines.get(i), x + indent, y + i * LINE + 1, Theme.TXT, false);
        }

        @Override
        public Style styleAt(int rx, int ry) {
            int i = ry / LINE;
            if (i < 0 || i >= lines.size()) return null;
            return font.getSplitter().componentStyleAtWidth(lines.get(i), rx - indent);
        }
    }

    private interface Inner {
        List<Part> build(int innerWidth);
    }

    private Part card(int bg, int bar, int width, Inner inner) {
        return new CardPart(bg, bar, inner.build(width - 14));
    }

    private static final class CardPart implements Part {
        private static final int PAD = 6;
        private final int bg;
        private final int bar;
        private final List<Part> inner;

        CardPart(int bg, int bar, List<Part> inner) {
            this.bg = bg;
            this.bar = bar;
            this.inner = inner;
        }

        @Override
        public int height() {
            return TranscriptView.height(inner) + PAD * 2 - 2;
        }

        @Override
        public void render(GuiGraphics g, int x, int y, int w, int mouseX, int mouseY) {
            g.fill(x, y, x + w, y + height(), bg);
            g.fill(x, y, x + 2, y + height(), bar);
            int cy = y + PAD - 1;
            for (Part p : inner) {
                p.render(g, x + PAD + 2, cy, w - PAD * 2 - 2, mouseX, mouseY);
                cy += p.height();
            }
        }

        @Override
        public Style styleAt(int rx, int ry) {
            int cy = PAD - 1;
            for (Part p : inner) {
                if (ry >= cy && ry < cy + p.height()) return p.styleAt(rx - PAD - 2, ry - cy);
                cy += p.height();
            }
            return null;
        }
    }

    private final class ListItemPart implements Part {
        private final String bullet;
        private final int indent;
        private final int textX;
        private final List<FormattedCharSequence> lines;

        ListItemPart(String bullet, int indent, Component text, int width) {
            this.bullet = bullet;
            this.indent = indent;
            this.textX = indent + Math.max(12, font.width(bullet) + 6);
            this.lines = font.split(text, Math.max(20, width - textX));
        }

        @Override
        public int height() {
            return Math.max(1, lines.size()) * LINE;
        }

        @Override
        public void render(GuiGraphics g, int x, int y, int w, int mouseX, int mouseY) {
            g.drawString(font, bullet, x + indent + 2, y + 1, Theme.TXT_3, false);
            for (int i = 0; i < lines.size(); i++) g.drawString(font, lines.get(i), x + textX, y + i * LINE + 1, Theme.TXT, false);
        }

        @Override
        public Style styleAt(int rx, int ry) {
            int i = ry / LINE;
            if (i < 0 || i >= lines.size()) return null;
            return font.getSplitter().componentStyleAtWidth(lines.get(i), rx - textX);
        }
    }

    private final class CodePart implements Part {
        private static final int HEAD = 13;
        private final String header;
        private final List<FormattedCharSequence> lines = new ArrayList<>();

        CodePart(Markdown.Code code, int width) {
            String[] raw = code.body().split("\n", -1);
            header = code.lang() + "  ·  " + raw.length + (raw.length == 1 ? " line" : " lines");
            Style mono = Style.EMPTY.withFont(Minecraft.UNIFORM_FONT).withColor(Theme.TXT_2);
            for (String line : raw) {
                List<FormattedCharSequence> wrapped = font.split(Component.literal(line.replace("\t", "    ")).withStyle(mono), Math.max(20, width - 12));
                lines.addAll(wrapped.isEmpty() ? List.of(FormattedCharSequence.EMPTY) : wrapped);
            }
        }

        @Override
        public int height() {
            return HEAD + lines.size() * LINE + 6;
        }

        @Override
        public void render(GuiGraphics g, int x, int y, int w, int mouseX, int mouseY) {
            g.fill(x, y, x + w, y + height(), Theme.CARD_2);
            g.fill(x, y, x + w, y + HEAD, 0x0AFFFFFF);
            g.fill(x, y + HEAD - 1, x + w, y + HEAD, Theme.EDGE_2);
            g.renderOutline(x, y, w, height(), Theme.EDGE_2);
            g.drawString(font, header, x + 6, y + 3, Theme.TXT_3, false);
            for (int i = 0; i < lines.size(); i++) g.drawString(font, lines.get(i), x + 6, y + HEAD + 3 + i * LINE, Theme.TXT_2, false);
        }
    }

    private final class TablePart implements Part {
        private static final int CELL_PAD = 4;
        private final int[] colX;
        private final int[] colW;
        private final List<List<List<FormattedCharSequence>>> rows = new ArrayList<>();
        private final List<Markdown.Align> align;
        private final int[] rowH;

        TablePart(Markdown.Table t, int width) {
            int cols = t.header().size();
            for (List<String> r : t.rows()) cols = Math.max(cols, r.size());
            List<List<String>> all = new ArrayList<>();
            all.add(t.header());
            all.addAll(t.rows());
            int[] natural = new int[cols];
            for (List<String> r : all) {
                for (int c = 0; c < r.size(); c++) natural[c] = Math.max(natural[c], font.width(inline(r.get(c), Theme.TXT)) + CELL_PAD * 2);
            }
            int sum = 0;
            for (int n : natural) sum += Math.max(n, 16);
            colW = new int[cols];
            colX = new int[cols];
            int cx = 0;
            for (int c = 0; c < cols; c++) {
                int n = Math.max(natural[c], 16);
                colW[c] = sum <= width ? n : Math.max(24, n * width / sum);
                colX[c] = cx;
                cx += colW[c];
            }
            align = t.align();
            rowH = new int[all.size()];
            for (int r = 0; r < all.size(); r++) {
                List<List<FormattedCharSequence>> cells = new ArrayList<>();
                int maxLines = 1;
                for (int c = 0; c < cols; c++) {
                    String cell = c < all.get(r).size() ? all.get(r).get(c) : "";
                    MutableComponent text = inline(cell, r == 0 ? Theme.TXT : Theme.TXT_2);
                    if (r == 0) text = text.withStyle(s -> s.withBold(true));
                    List<FormattedCharSequence> wrapped = font.split(text, Math.max(8, colW[c] - CELL_PAD * 2));
                    cells.add(wrapped);
                    maxLines = Math.max(maxLines, wrapped.size());
                }
                rows.add(cells);
                rowH[r] = maxLines * LINE + 4;
            }
        }

        @Override
        public int height() {
            int sum = 0;
            for (int r : rowH) sum += r;
            return sum + 1;
        }

        @Override
        public void render(GuiGraphics g, int x, int y, int w, int mouseX, int mouseY) {
            int tableW = colX[colX.length - 1] + colW[colW.length - 1];
            int cy = y;
            for (int r = 0; r < rows.size(); r++) {
                if (r == 0) g.fill(x, cy, x + tableW, cy + rowH[r], Theme.CARD_3);
                g.fill(x, cy, x + tableW, cy + 1, Theme.EDGE_2);
                for (int c = 0; c < colW.length; c++) {
                    List<FormattedCharSequence> cell = rows.get(r).get(c);
                    for (int i = 0; i < cell.size(); i++) {
                        int lw = font.width(cell.get(i));
                        Markdown.Align a = c < align.size() ? align.get(c) : Markdown.Align.NONE;
                        int off = a == Markdown.Align.RIGHT ? colW[c] - CELL_PAD - lw
                                : a == Markdown.Align.CENTER ? (colW[c] - lw) / 2 : CELL_PAD;
                        g.drawString(font, cell.get(i), x + colX[c] + off, cy + 3 + i * LINE, Theme.TXT_2, false);
                    }
                }
                cy += rowH[r];
            }
            g.fill(x, cy, x + tableW, cy + 1, Theme.EDGE_2);
            for (int c = 1; c < colX.length; c++) g.fill(x + colX[c], y, x + colX[c] + 1, cy, Theme.EDGE);
        }
    }

    private final class ToolPart implements Part {
        private final Transcript.Tool tool;

        ToolPart(Transcript.Tool tool) {
            this.tool = tool;
        }

        @Override
        public int height() {
            return 14;
        }

        @Override
        public void render(GuiGraphics g, int x, int y, int w, int mouseX, int mouseY) {
            g.fill(x, y, x + w, y + 14, Theme.CARD);
            g.fill(x, y, x + w, y + 1, Theme.EDGE);
            int dot = Theme.TXT_4;
            if (tool.running()) {
                int a = 120 + (int) (135 * (0.5 + 0.5 * Math.sin(System.currentTimeMillis() / 250.0)));
                dot = Theme.withAlpha(Theme.OK, a);
            }
            g.fill(x + 6, y + 5, x + 10, y + 9, dot);
            String name = tool.name() == null ? "tool" : tool.name();
            int nameW = font.width(Component.literal(name).withStyle(s -> s.withBold(true)));
            g.drawString(font, Component.literal(name).withStyle(s -> s.withBold(true)), x + 15, y + 3, Theme.TXT, false);
            int right = x + w - 6;
            if (tool.running()) {
                int rw = font.width("running");
                g.drawString(font, "running", right - rw, y + 3, Theme.ACCENT, false);
                right -= rw + 8;
            }
            if (tool.arg() != null) {
                int ax = x + 15 + nameW + 8;
                int avail = right - ax;
                if (avail > 12) {
                    String arg = tool.arg();
                    String cut = font.plainSubstrByWidth(arg, avail);
                    if (cut.length() < arg.length()) cut = font.plainSubstrByWidth(arg, avail - font.width("…")) + "…";
                    g.drawString(font, cut, ax, y + 3, Theme.TXT_4, false);
                }
            }
        }
    }

    /** "N TOOL CALLS ▸": click to show or hide the run. */
    private final class ChainPart implements Part {
        private final Chain chain;

        ChainPart(Chain chain) {
            this.chain = chain;
        }

        @Override
        public int height() {
            return 14;
        }

        @Override
        public void render(GuiGraphics g, int x, int y, int w, int mouseX, int mouseY) {
            boolean running = chain.tools().stream().anyMatch(Transcript.Tool::running);
            boolean open = openChains.contains(chain.key());
            boolean hover = mouseX >= x && mouseX < x + w && mouseY >= y && mouseY < y + 14;
            int dot = running ? Theme.withAlpha(Theme.OK, 120 + (int) (135 * (0.5 + 0.5 * Math.sin(System.currentTimeMillis() / 250.0))))
                    : Theme.TXT_4;
            g.fill(x + 6, y + 5, x + 10, y + 9, dot);
            String label = chain.tools().size() + " TOOL CALLS  " + (open ? "▾" : "▸");
            g.drawString(font, label, x + 15, y + 3, hover ? Theme.TXT : Theme.TXT_3, false);
        }

        @Override
        public boolean click(int rx, int ry) {
            if (!openChains.remove(chain.key())) openChains.add(chain.key());
            return true;
        }
    }

    private final class DividerPart implements Part {
        private final String text;
        private final int color;

        DividerPart(String text, int color) {
            this.text = text;
            this.color = color;
        }

        @Override
        public int height() {
            return LINE + 2;
        }

        @Override
        public void render(GuiGraphics g, int x, int y, int w, int mouseX, int mouseY) {
            int tw = font.width(text);
            int mid = y + 6;
            int tx = x + (w - tw) / 2;
            g.fill(x, mid, tx - 6, mid + 1, Theme.EDGE_2);
            g.fill(tx + tw + 6, mid, x + w, mid + 1, Theme.EDGE_2);
            g.drawString(font, text, tx, y + 2, color, false);
        }
    }

    private final class CursorPart implements Part {
        @Override
        public int height() {
            return LINE;
        }

        @Override
        public void render(GuiGraphics g, int x, int y, int w, int mouseX, int mouseY) {
            if ((System.currentTimeMillis() / 500) % 2 == 0) g.fill(x + 1, y + 2, x + 6, y + 10, Theme.ACCENT);
        }
    }

    private final class ImagePart implements Part {
        private static final int MAX_W = 220;
        private static final int MAX_H = 140;
        private final String path;

        ImagePart(String path) {
            this.path = path;
        }

        private int[] size(ImageCache.Img img) {
            double scale = Math.min(1.0, Math.min((double) MAX_W / img.width(), (double) MAX_H / img.height()));
            return new int[] {Math.max(1, (int) (img.width() * scale)), Math.max(1, (int) (img.height() * scale))};
        }

        @Override
        public int height() {
            ImageCache.Img img = ImageCache.peek(path);
            return (img == null ? LINE : size(img)[1]) + 6;
        }

        @Override
        public void render(GuiGraphics g, int x, int y, int w, int mouseX, int mouseY) {
            ImageCache.Img img = ImageCache.get(client.get(), path); // only visible images load
            String name = path.substring(path.lastIndexOf('/') + 1);
            if (img == null) {
                String label = ImageCache.failed(path) ? "image unavailable: " + name : "loading image " + name + "…";
                g.drawString(font, label, x + 2, y + 4, Theme.TXT_4, false);
                return;
            }
            int[] s = size(img);
            g.blit(img.texture(), x, y + 3, s[0], s[1], 0, 0, img.width(), img.height(), img.width(), img.height());
            boolean hover = mouseX >= x && mouseX < x + s[0] && mouseY >= y + 3 && mouseY < y + 3 + s[1];
            g.renderOutline(x - 1, y + 2, s[0] + 2, s[1] + 2, hover ? Theme.ACCENT : Theme.EDGE_2);
        }

        @Override
        public boolean click(int rx, int ry) {
            ImageCache.Img img = ImageCache.peek(path);
            if (img == null || rx > size(img)[0]) return false;
            openImage.accept(img);
            return true;
        }
    }
}
