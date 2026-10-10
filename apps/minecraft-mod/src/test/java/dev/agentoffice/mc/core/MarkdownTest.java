package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.agentoffice.mc.core.Markdown.Align;
import dev.agentoffice.mc.core.Markdown.Code;
import dev.agentoffice.mc.core.Markdown.Heading;
import dev.agentoffice.mc.core.Markdown.Line;
import dev.agentoffice.mc.core.Markdown.ListBlock;
import dev.agentoffice.mc.core.Markdown.ListItem;
import dev.agentoffice.mc.core.Markdown.Paragraph;
import dev.agentoffice.mc.core.Markdown.Span;
import dev.agentoffice.mc.core.Markdown.Table;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** The streaming cases are ported from apps/web/src/lib/markdown.test.ts: every prefix must look sane. */
class MarkdownTest {
    private static final List<String> MESSAGES = List.of(
            "Let me check the config file:\n```bash\ncat package.json\n```\nDone.",
            "I updated `apps/web` — now run:\n```bash\npnpm typecheck\npnpm lint\n```\nIt passes.",
            "Two blocks:\n\n```ts\nconst a = 1;\n```\n\nand\n\n```bash\nls -la\n```\n\nthat's it.");

    private static List<String> proseOf(String text) {
        return Markdown.splitProse(text).stream().filter(i -> i instanceof Line).map(i -> ((Line) i).text()).toList();
    }

    private static List<Code> codeOf(String text) {
        return Markdown.splitProse(text).stream().filter(i -> i instanceof Code).map(i -> (Code) i).toList();
    }

    @Test
    void noPrefixOfAStreamingMessageLeaksFenceBackticksIntoProse() {
        for (String full : MESSAGES) {
            for (int i = 1; i <= full.length(); i++) {
                for (String line : proseOf(full.substring(0, i))) {
                    assertFalse(line.contains("``"), "leaked fence at prefix " + i + ": " + line);
                }
            }
        }
    }

    @Test
    void aFencesLangNeverRendersHalfStreamed() {
        String full = MESSAGES.get(1);
        Set<String> langs = new LinkedHashSet<>();
        for (int i = 1; i <= full.length(); i++) {
            for (Code c : codeOf(full.substring(0, i))) langs.add(c.lang());
        }
        assertEquals(Set.of("bash"), langs);
    }

    @Test
    void anOpenFencesBodyOnlyGrows() {
        String full = MESSAGES.get(1);
        String longest = "";
        for (int i = 1; i <= full.length(); i++) {
            List<Code> code = codeOf(full.substring(0, i));
            if (code.isEmpty()) continue;
            String body = code.get(0).body();
            assertTrue(body.startsWith(longest), "body went backwards at prefix " + i + ": " + body);
            longest = body;
        }
        assertEquals("pnpm typecheck\npnpm lint", longest);
    }

    @Test
    void anUnclosedFenceInFinishedTextIsACodeBlock() {
        assertEquals(List.of(new Line("Here:"), new Line(""), new Code("bash", "ls -la")),
                Markdown.splitProse("Here:\n```bash\nls -la"));
    }

    @Test
    void closedFencesTablesAndPlainProse() {
        assertEquals(List.of(new Line("a"), new Line(""), new Code("ts", "x"), new Line(""), new Line("b")),
                Markdown.splitProse("a\n```ts\nx\n```\nb"));
        assertEquals(List.of(new Line("just prose"), new Line("over two lines")),
                Markdown.splitProse("just prose\nover two lines"));
        assertEquals(List.of(new Table(List.of("a", "b"), List.of(Align.NONE, Align.NONE), List.of(List.of("1", "2")))),
                Markdown.splitProse("| a | b |\n| --- | --- |\n| 1 | 2 |"));
    }

    @Test
    void inlineCodeSpansAreLeftToTheInlineRenderer() {
        assertEquals(List.of(new Line("run `pnpm dev` first")), Markdown.splitProse("run `pnpm dev` first"));
    }

    @Test
    void blocksGroupLikeTheWebChat() {
        String text = "## Plan\nFirst line\nsecond line\n\n- one\n  - nested\n- two\n\n1. a\n2. b\n```js\nx()\n```";
        assertEquals(List.of(
                new Heading("Plan"),
                new Paragraph("First line second line"),
                new ListBlock(false, List.of(new ListItem(0, "•", "one"), new ListItem(1, "•", "nested"), new ListItem(0, "•", "two"))),
                new ListBlock(true, List.of(new ListItem(0, "1.", "a"), new ListItem(0, "2.", "b"))),
                new Code("js", "x()")), Markdown.blocks(text));
    }

    @Test
    void boldAndLinksSpanInlineCodeLikeInlineMd() {
        assertEquals(List.of(
                new Span("see ", false, true, false, null),
                new Span("x", true, true, false, null),
                new Span(" here", false, true, false, null)), Markdown.inline("**see `x` here**"));
        assertEquals(List.of(new Span("a.ts", true, false, false, "https://x.dev/a")),
                Markdown.inline("[`a.ts`](https://x.dev/a)"));
    }

    @Test
    void inlineStylesNestAndCodeStaysLiteral() {
        assertEquals(List.of(
                new Span("a ", false, false, false, null),
                new Span("bold", false, true, false, null),
                new Span(" ", false, false, false, null),
                new Span("**not bold**", true, false, false, null),
                new Span(" ", false, false, false, null),
                new Span("it", false, false, true, null),
                new Span(" ", false, false, false, null),
                new Span("docs", false, true, false, "https://x.dev")),
                Markdown.inline("a **bold** `**not bold**` *it* **[docs](https://x.dev)**"));
    }
}
