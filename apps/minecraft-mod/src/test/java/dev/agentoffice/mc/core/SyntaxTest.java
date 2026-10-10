package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.agentoffice.mc.core.Syntax.Kind;
import dev.agentoffice.mc.core.Syntax.Lang;
import java.util.List;
import org.junit.jupiter.api.Test;

class SyntaxTest {
    /** "word=KIND" for every span, in order. */
    private static List<String> tokens(String text, Lang lang) {
        return Syntax.line(text, lang, false).spans().stream()
                .map(s -> text.substring(s.start(), s.end()) + "=" + s.kind())
                .toList();
    }

    @Test
    void javaLineGetsDarkPlusKinds() {
        assertEquals(List.of("public=KEYWORD", "int=KEYWORD", "getFGColor=FUNCTION", "if=CONTROL", "active=VARIABLE",
                        "return=CONTROL", "super=KEYWORD", "getFGColor=FUNCTION"),
                tokens("public int getFGColor() { if (!active) return super.getFGColor(); }", Lang.C_LIKE));
        assertEquals(List.of("private=KEYWORD", "static=KEYWORD", "final=KEYWORD", "int=KEYWORD", "DANGER_TEXT=CONSTANT",
                "0xFF5555=NUMBER"), tokens("private static final int DANGER_TEXT = 0xFF5555;", Lang.C_LIKE));
        assertEquals(List.of("@Override=ANNOTATION"), tokens("    @Override", Lang.C_LIKE));
        assertEquals(List.of("Theme=TYPE", "ACCENT_SOFT=CONSTANT"), tokens("Theme.ACCENT_SOFT", Lang.C_LIKE));
    }

    @Test
    void stringsAndCommentsSwallowWhatLooksLikeCode() {
        assertEquals(List.of("status=VARIABLE", "\"Couldn't reach // if\"=STRING", "// return x=COMMENT"),
                tokens("status = \"Couldn't reach // if\" // return x", Lang.C_LIKE));
        assertEquals(List.of("\"a \\\" b\"=STRING", "c=VARIABLE"), tokens("\"a \\\" b\" + c", Lang.C_LIKE));
        assertEquals(List.of("\"open=STRING"), tokens("\"open", Lang.C_LIKE), "an unclosed string ends at the line's end");
    }

    @Test
    void blockCommentsCarryAcrossLines() {
        Syntax.Result first = Syntax.line("int a; /* starts", Lang.C_LIKE, false);
        assertTrue(first.inBlockComment());
        Syntax.Result middle = Syntax.line(" * still a comment if return", Lang.C_LIKE, true);
        assertEquals(1, middle.spans().size());
        assertEquals(Kind.COMMENT, middle.spans().get(0).kind());
        assertTrue(middle.inBlockComment());
        Syntax.Result last = Syntax.line(" ends */ return 1;", Lang.C_LIKE, true);
        assertFalse(last.inBlockComment());
        assertEquals(List.of(Kind.COMMENT, Kind.CONTROL, Kind.NUMBER), last.spans().stream().map(Syntax.Span::kind).toList());
    }

    @Test
    void hashLanguagesAndJson() {
        assertEquals(List.of("\"x\"=STRING", "# note=COMMENT"), tokens("name = \"x\" # note", Lang.HASH));
        assertEquals(List.of(), tokens("url=http://a#frag", Lang.HASH), "a # inside a word is no comment");
        assertEquals(List.of("\"gui\"=VARIABLE", "\"nine_slice\"=STRING", "4=NUMBER", "true=KEYWORD"),
                tokens("{\"gui\": \"nine_slice\", 4, true}", Lang.JSON));
    }

    @Test
    void namesAfterADotAreMembersNotKeywords() {
        assertEquals(List.of("List=TYPE", "of=FUNCTION", "a=VARIABLE"), tokens("List.of(a)", Lang.C_LIKE));
        assertEquals(List.of("Array=TYPE", "from=FUNCTION", "x=VARIABLE"), tokens("Array.from(x)", Lang.C_LIKE));
        assertEquals(List.of("file=VARIABLE", "type=VARIABLE", "data=VARIABLE", "type=VARIABLE"),
                tokens("file.type == data.type", Lang.C_LIKE));
        assertEquals(List.of("Foo=TYPE", "class=KEYWORD"), tokens("Foo.class", Lang.C_LIKE));
    }

    @Test
    void apostrophesAreNotStrings() {
        assertEquals(List.of("# trailing=COMMENT"), tokens("name: Don't do this # trailing", Lang.HASH));
        assertEquals(List.of("a=VARIABLE", "'x'=STRING"), tokens("a = 'x'", Lang.C_LIKE));
        assertEquals(List.of("\"it's\"=STRING"), tokens("\"it's\"", Lang.C_LIKE));
    }

    @Test
    void edgeCases() {
        assertEquals(List.of("s=VARIABLE", "\"/* no */\"=STRING", "x=VARIABLE"), tokens("s = \"/* no */\" + x", Lang.C_LIKE));
        assertFalse(Syntax.line("s = \"/* no\";", Lang.C_LIKE, false).inBlockComment());
        assertEquals(List.of("\"a\\\\\"=STRING", "b=VARIABLE"), tokens("\"a\\\\\" + b", Lang.C_LIKE), "an escaped backslash ends the string");
        assertEquals(List.of("1e10=NUMBER", "0x1F=NUMBER", "$el=VARIABLE"), tokens("1e10 + 0x1F + $el", Lang.C_LIKE));
        assertEquals(List.of(), tokens("x".repeat(Syntax.MAX_LINE + 1), Lang.C_LIKE), "a minified line is left plain");
        assertTrue(Syntax.continuesComment("   * Don't touch", Lang.C_LIKE));
        assertTrue(Syntax.continuesComment("   */", Lang.C_LIKE));
        assertFalse(Syntax.continuesComment("a * b", Lang.C_LIKE));
        assertFalse(Syntax.continuesComment("*out = value;", Lang.C_LIKE), "a pointer dereference");
    }

    /** Kinds of every line of one diff side, fed in order. */
    private static List<List<Kind>> side(Lang lang, String... lines) {
        Syntax.Side side = new Syntax.Side();
        return java.util.Arrays.stream(lines)
                .map(l -> side.next(l, lang).spans().stream().map(Syntax.Span::kind).toList())
                .toList();
    }

    @Test
    void aHunkThatStartsInsideAJavadoc() {
        assertEquals(List.of(List.of(Kind.COMMENT), List.of(Kind.COMMENT), List.of(Kind.COMMENT), List.of(Kind.KEYWORD, Kind.VARIABLE)),
                side(Lang.C_LIKE, "     * Don't touch", "     * more", "     */", "    int x;"));
    }

    @Test
    void codeThatStartsWithAStarNeverOpensAComment() {
        assertEquals(List.of(List.of(Kind.VARIABLE, Kind.VARIABLE), List.of(Kind.CONTROL, Kind.NUMBER), List.of(Kind.KEYWORD, Kind.FUNCTION, Kind.KEYWORD)),
                side(Lang.C_LIKE, "*out = value;", "return 0;", "int main(void) {"));
        // An operator-first wrap at a hunk's start reads as one comment line at most, never more.
        assertEquals(List.of(Kind.CONTROL, Kind.VARIABLE), side(Lang.C_LIKE, "        * factor;", "return total;").get(1));
        // After the first real line the guess is over: a later "* x" is code.
        assertEquals(List.of(Kind.VARIABLE), side(Lang.C_LIKE, "int a;", "    * x;").get(1));
    }

    @Test
    void prefixedStringsStillOpen() {
        assertEquals(List.of("\"hello {x}\"=STRING"), tokens("print(f\"hello {x}\")", Lang.HASH));
        assertEquals(List.of("'x+'=STRING"), tokens("re = r'x+'", Lang.HASH));
        assertEquals(List.of("gql=VARIABLE", "`query { a }`=STRING", "run=FUNCTION", "q=VARIABLE"), tokens("gql`query { a }`; run(q)", Lang.C_LIKE));
        assertEquals(List.of("$=VARIABLE", "\"Hi {name}\"=STRING", "Log=FUNCTION", "s=VARIABLE"), tokens("$\"Hi {name}\"; Log(s);", Lang.C_LIKE));
    }

    @Test
    void languagesFromPathsAndFences() {
        assertEquals(Lang.HASH, Syntax.forPath("docker/Dockerfile"));
        assertEquals(Lang.NONE, Syntax.forPath("src/lib.rs"), "Rust lifetimes ('a) would read as strings");
        assertEquals(Lang.C_LIKE, Syntax.forPath("apps/minecraft-mod/src/main/java/A.java"));
        assertEquals(Lang.C_LIKE, Syntax.forName("ts"));
        assertEquals(Lang.HASH, Syntax.forName("bash"));
        assertEquals(Lang.JSON, Syntax.forPath("x.png.mcmeta"));
        assertEquals(Lang.NONE, Syntax.forPath("docs/minecraft-tablet-design.md"));
        assertEquals(List.of(), tokens("if this were code", Lang.NONE));
    }
}
