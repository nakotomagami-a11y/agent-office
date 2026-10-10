package dev.agentoffice.mc.client.ui;

import dev.agentoffice.mc.core.Syntax;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.gui.Font;
import net.minecraft.network.chat.Style;
import net.minecraft.util.FormattedCharSequence;

/**
 * A code line in Dark+ colours from {@link Syntax} spans, wrapped or cut; text no span covers is
 * {@code plain}. The text must have been through {@link dev.agentoffice.mc.core.Review#visible}: lines
 * are measured with formatting codes ({@code §}) parsed and drawn with them shown, so a raw {@code §}
 * would make the two disagree. Wrapping splits the plain string (linear) and slices the spans by offset.
 */
public final class CodeText {
    private CodeText() {}

    public static int color(Syntax.Kind kind) {
        return switch (kind) {
            case KEYWORD -> Theme.CODE_KEYWORD;
            case CONTROL -> Theme.CODE_CONTROL;
            case STRING -> Theme.CODE_STRING;
            case COMMENT -> Theme.CODE_COMMENT;
            case NUMBER -> Theme.CODE_NUMBER;
            case TYPE -> Theme.CODE_TYPE;
            case FUNCTION, ANNOTATION -> Theme.CODE_FUNCTION;
            case VARIABLE -> Theme.CODE_VARIABLE;
            case CONSTANT -> Theme.CODE_CONSTANT;
        };
    }

    /** In the order written: Font#split's bidi pass would lay a line starting with Hebrew/Arabic right to left. */
    public static List<FormattedCharSequence> wrap(Font font, String text, List<Syntax.Span> spans, int plain, int width) {
        List<FormattedCharSequence> out = new ArrayList<>();
        font.getSplitter().splitLines(text, width, Style.EMPTY, false, (style, from, to) -> out.add(slice(text, spans, from, to, plain)));
        return out;
    }

    /** One line cut to {@code width}, ending in "…" when anything was cut. */
    public static FormattedCharSequence cut(Font font, String text, List<Syntax.Span> spans, int plain, int width, int ellipsisColor) {
        if (font.width(text) <= width) return slice(text, spans, 0, text.length(), plain);
        int end = font.plainSubstrByWidth(text, Math.max(0, width - font.width("…"))).length();
        return FormattedCharSequence.composite(slice(text, spans, 0, end, plain),
                FormattedCharSequence.forward("…", Style.EMPTY.withColor(ellipsisColor)));
    }

    /** {@code text[from, to)} in its spans' colours. */
    private static FormattedCharSequence slice(String text, List<Syntax.Span> spans, int from, int to, int plain) {
        List<FormattedCharSequence> parts = new ArrayList<>();
        int at = from;
        for (Syntax.Span s : spans) {
            if (s.end() <= from) continue;
            if (s.start() >= to) break;
            int a = Math.max(s.start(), from);
            int b = Math.min(s.end(), to);
            if (a > at) parts.add(FormattedCharSequence.forward(text.substring(at, a), Style.EMPTY.withColor(plain)));
            parts.add(FormattedCharSequence.forward(text.substring(a, b), Style.EMPTY.withColor(color(s.kind()))));
            at = b;
        }
        if (at < to) parts.add(FormattedCharSequence.forward(text.substring(at, to), Style.EMPTY.withColor(plain)));
        return FormattedCharSequence.composite(parts);
    }
}
