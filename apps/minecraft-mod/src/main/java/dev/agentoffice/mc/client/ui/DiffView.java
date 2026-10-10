package dev.agentoffice.mc.client.ui;

import dev.agentoffice.mc.core.Review;
import dev.agentoffice.mc.core.Syntax;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.FormattedText;
import net.minecraft.network.chat.Style;
import net.minecraft.util.FormattedCharSequence;

/**
 * One file's diff as the Review Lectern shows it: a header bar, then hunk headers, folded gaps and
 * numbered lines tinted by kind and coloured by syntax (Dark+), wrapped or cut. Owns its scroll position and wrap setting. Every
 * text it draws went through {@link Review#visible} first: PR content must not act as formatting.
 */
public final class DiffView {
    public static final int LINE_H = 10;
    private static final int HEADER_H = 16;

    private record VRow(Review.Row row, FormattedCharSequence text, boolean continuation) {}

    private Review.DiffFile file;
    private int x0;
    private int y0;
    private int x1;
    private int y1;
    private boolean wrap = true;
    private int scroll;
    private List<VRow> rows = List.of();
    /** What {@link #rows} were built for; rebuilt when any of these change. */
    private Review.DiffFile builtFile;
    private int builtWidth = -1;
    private boolean builtWrap;
    private int numW;

    public void setBounds(int x0, int y0, int x1, int y1) {
        this.x0 = x0;
        this.y0 = y0;
        this.x1 = x1;
        this.y1 = y1;
    }

    public void setFile(Review.DiffFile file) {
        if (this.file == file) return;
        this.file = file;
        scroll = 0;
    }

    public boolean wrap() {
        return wrap;
    }

    /** Keeps the same source row at the top: wrapping changes how many visual rows come before it. */
    public void toggleWrap() {
        Review.Row topRow = scroll < rows.size() ? rows.get(scroll).row() : null;
        wrap = !wrap;
        builtWidth = -1;
        pendingTop = topRow;
    }

    private Review.Row pendingTop;

    /** Positive = down. Clamped when drawn. */
    public void scrollBy(int rows) {
        scroll = Math.max(0, scroll + rows);
    }

    public void toTop() {
        scroll = 0;
    }

    public void toBottom() {
        scroll = Integer.MAX_VALUE / 2;
    }

    public int visibleRows() {
        return Math.max(1, (y1 - y0 - HEADER_H) / LINE_H);
    }

    public void render(GuiGraphics g, Font font) {
        g.fill(x0, y0, x1, y1, Theme.CARD);
        if (file == null) return;
        g.fill(x0, y0, x1, y0 + 14, Theme.CARD_2);
        g.drawString(font, String.valueOf(file.letter()), x0 + 5, y0 + 3, letterColor(file.letter()), false);
        String stats = "+" + file.additions() + " −" + file.deletions();
        int sw = font.width(stats);
        g.drawString(font, stats, x1 - 5 - sw, y0 + 3, Theme.TXT_3, false);
        int px = x0 + 16;
        String dir = cut(font, Review.visible(file.dir()), (x1 - x0) / 2);
        g.drawString(font, dir, px, y0 + 3, Theme.TXT_4, false);
        px += font.width(dir);
        g.drawString(font, cut(font, Review.visible(file.name()), x1 - 12 - sw - px), px, y0 + 3, Theme.TXT, false);

        if (file != builtFile) numW = font.width("0") * digits(file) + 4;
        int textX = x0 + numW * 2 + 12;
        build(font, Math.max(20, x1 - 8 - textX));
        if (pendingTop != null) {
            for (int i = 0; i < rows.size(); i++) {
                if (rows.get(i).row() == pendingTop && !rows.get(i).continuation()) {
                    scroll = i;
                    break;
                }
            }
            pendingTop = null;
        }
        int top = y0 + HEADER_H;
        int visible = visibleRows();
        scroll = Math.max(0, Math.min(scroll, rows.size() - visible));
        g.enableScissor(x0, top, x1, y1);
        for (int i = scroll; i < Math.min(rows.size(), scroll + visible); i++) {
            VRow v = rows.get(i);
            int y = top + (i - scroll) * LINE_H;
            Review.Row r = v.row();
            switch (r.kind()) {
                case ADD -> g.fill(x0, y, x1, y + LINE_H, Theme.DIFF_ADD);
                case DEL -> g.fill(x0, y, x1, y + LINE_H, Theme.DIFF_DEL);
                case HUNK -> g.fill(x0, y, x1, y + LINE_H, Theme.CARD_2);
                default -> { }
            }
            if (isCode(r)) {
                if (v.continuation()) {
                    g.drawString(font, "»", x0 + numW * 2 - 6, y + 1, Theme.TXT_4, false);
                } else {
                    if (r.oldLine() != null) drawRight(g, font, String.valueOf(r.oldLine()), x0 + numW, y + 1);
                    if (r.newLine() != null) drawRight(g, font, String.valueOf(r.newLine()), x0 + numW * 2, y + 1);
                    if (r.kind() != Review.RowKind.CONTEXT) {
                        boolean add = r.kind() == Review.RowKind.ADD;
                        g.drawString(font, add ? "+" : "−", x0 + numW * 2 + 4, y + 1, add ? Theme.GREEN : Theme.RED, false);
                    }
                }
                g.drawString(font, v.text(), textX, y + 1, Theme.TXT, false);
            } else {
                g.drawString(font, v.text(), x0 + 6, y + 1, r.kind() == Review.RowKind.HUNK ? Theme.ACCENT_SOFT : Theme.TXT_4, false);
            }
        }
        g.disableScissor();
        if (rows.size() > visible) {
            int trackH = y1 - top;
            int barH = Math.max(12, trackH * visible / rows.size());
            int barY = top + (trackH - barH) * scroll / Math.max(1, rows.size() - visible);
            g.fill(x1 - 3, barY, x1 - 1, barY + barH, Theme.BG_4);
        }
    }

    private static boolean isCode(Review.Row r) {
        return r.kind() == Review.RowKind.ADD || r.kind() == Review.RowKind.DEL || r.kind() == Review.RowKind.CONTEXT;
    }

    /** Visual rows at this width; rebuilt only when the file, width or wrap change. */
    private void build(Font font, int textW) {
        if (file == builtFile && textW == builtWidth && wrap == builtWrap) return;
        builtFile = file;
        builtWidth = textW;
        builtWrap = wrap;
        List<VRow> out = new ArrayList<>();
        int fullW = x1 - x0 - 12;
        Syntax.Lang lang = Syntax.forPath(file.path());
        // The old and the new file each have their own comment state: deleted lines carry the old one,
        // added lines the new one, context lines are both.
        Syntax.Side oldSide = new Syntax.Side();
        Syntax.Side newSide = new Syntax.Side();
        for (Review.Row r : Review.rows(file)) {
            boolean code = isCode(r);
            String text = Review.visible(r.kind() == Review.RowKind.GAP ? "⋯ " + r.text() : r.text());
            if (!code) {
                oldSide.reset();
                newSide.reset();
                out.add(new VRow(r, FormattedCharSequence.forward(cut(font, text, fullW), Style.EMPTY), false));
                continue;
            }
            Syntax.Result syntax = (r.kind() == Review.RowKind.DEL ? oldSide : newSide).next(text, lang);
            if (r.kind() == Review.RowKind.CONTEXT) oldSide.copyFrom(newSide);
            if (wrap) {
                List<FormattedCharSequence> parts = CodeText.wrap(font, text, syntax.spans(), Theme.TXT, textW);
                if (parts.isEmpty()) parts = List.of(FormattedCharSequence.EMPTY);
                for (int i = 0; i < parts.size(); i++) out.add(new VRow(r, parts.get(i), i > 0));
            } else {
                out.add(new VRow(r, CodeText.cut(font, text, syntax.spans(), Theme.TXT, textW, Theme.TXT_4), false));
            }
        }
        rows = out;
    }

    private static void drawRight(GuiGraphics g, Font font, String s, int xRight, int y) {
        g.drawString(font, s, xRight - font.width(s), y, Theme.TXT_4, false);
    }

    private static int digits(Review.DiffFile f) {
        int max = 1;
        for (Review.Hunk h : f.hunks()) {
            for (Review.Line l : h.lines()) {
                if (l.oldLine() != null) max = Math.max(max, l.oldLine());
                if (l.newLine() != null) max = Math.max(max, l.newLine());
            }
        }
        return Math.max(2, String.valueOf(max).length());
    }

    public static int letterColor(char letter) {
        return switch (letter) {
            case 'A' -> Theme.GREEN;
            case 'D' -> Theme.RED;
            case 'R' -> Theme.ACCENT_SOFT;
            default -> Theme.AMBER;
        };
    }

    /**
     * Wrapped lines in the order they were written. Font#split runs each line through the language's
     * bidi pass, where a line that starts with a Hebrew or Arabic letter is laid out right to left, so
     * code like `A = isAdmin || deny` would read reversed. PR text is shown as written instead.
     */
    public static List<FormattedCharSequence> logical(Font font, String text, int width) {
        List<FormattedCharSequence> out = new ArrayList<>();
        for (FormattedText line : font.getSplitter().splitLines(text, width, Style.EMPTY)) {
            out.add(FormattedCharSequence.forward(line.getString(), Style.EMPTY));
        }
        return out;
    }

    /** Cut to {@code width}, ending in "…" when anything was cut. */
    public static String cut(Font font, String s, int width) {
        if (width <= 0) return "";
        if (font.width(s) <= width) return s;
        return font.plainSubstrByWidth(s, Math.max(0, width - font.width("…"))) + "…";
    }
}
