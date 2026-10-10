package dev.agentoffice.mc.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Line-at-a-time syntax colouring for code in diffs and chat code blocks, after VS Code's Dark+
 * scopes: spans of the line by kind; what no span covers is plain text (operators, punctuation,
 * spaces). A {@code /* … *}{@code /} comment carries over to the next line through {@code inBlockComment}.
 * It is a highlighter, not a parser: good enough to read by, never relied on for meaning.
 */
public final class Syntax {
    private Syntax() {}

    public enum Kind { KEYWORD, CONTROL, STRING, COMMENT, NUMBER, TYPE, FUNCTION, VARIABLE, CONSTANT, ANNOTATION }

    /** {@code C_LIKE}: Java, Kotlin, JS/TS, Groovy… ({@code //}, {@code /*}); {@code HASH}: {@code #} comments. */
    public enum Lang { NONE, C_LIKE, HASH, JSON }

    public record Span(int start, int end, Kind kind) {}

    public record Result(List<Span> spans, boolean inBlockComment) {}

    /** Longer lines are shown uncoloured, as VS Code stops tokenizing them: minified code must not stall a frame. */
    public static final int MAX_LINE = 2000;

    /** Declarations, types and literals (Dark+ blue). */
    private static final Set<String> KEYWORDS = Set.of(
            "abstract", "boolean", "byte", "char", "class", "const", "double", "enum", "extends", "final", "float",
            "implements", "int", "interface", "long", "native", "new", "package", "private", "protected", "public",
            "record", "sealed", "permits", "short", "static", "super", "synchronized", "this", "transient",
            "var", "void", "volatile", "true", "false", "null", "let", "function", "async", "await", "type", "typeof",
            "instanceof", "in", "of", "undefined", "declare", "readonly", "namespace", "val", "fun",
            "override", "companion", "lateinit", "keyof", "satisfies");
    /** Still keywords after a dot ({@code Foo.class}, {@code Outer.this}); any other name there is a member. */
    private static final Set<String> AFTER_DOT = Set.of("class", "this", "super", "new");
    private static final Set<String> STRING_PREFIXES = Set.of("f", "r", "b", "u", "rb", "br", "fr", "rf");
    /** Control flow and imports (Dark+ purple). */
    private static final Set<String> CONTROL = Set.of(
            "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "return", "throw",
            "throws", "try", "catch", "finally", "yield", "import", "export", "from", "as", "when", "assert");

    public static Lang forPath(String path) {
        if (path == null) return Lang.NONE;
        String name = path.substring(path.lastIndexOf('/') + 1);
        int dot = name.lastIndexOf('.');
        return forName(dot < 0 ? name : name.substring(dot + 1));
    }

    /** Javadoc shape: {@code *}, {@code * text}, {@code *}{@code /} or {@code **}, not a {@code *p = v} or a {@code * factor} after an operator break. */
    static boolean continuesComment(String text, Lang lang) {
        if (lang != Lang.C_LIKE) return false;
        String t = text.stripLeading();
        return t.equals("*") || t.startsWith("* ") || t.startsWith("*/") || t.startsWith("**");
    }

    /**
     * One side of a diff (old or new file), coloured line by line. A hunk often starts inside a block
     * comment whose {@code /*} is out of view: until the first line that isn't one, Javadoc-shaped lines
     * read as comment, and a guessed line never carries comment state to the next.
     */
    public static final class Side {
        private boolean in;
        private boolean guessing = true;

        /** A hunk header or a fold: what came before is out of view. */
        public void reset() {
            in = false;
            guessing = true;
        }

        public void copyFrom(Side other) {
            in = other.in;
            guessing = other.guessing;
        }

        public Result next(String text, Lang lang) {
            boolean guessed = !in && guessing && continuesComment(text, lang);
            if (!guessed) guessing = false;
            Result r = line(text, lang, in || guessed);
            in = !guessed && r.inBlockComment();
            return r;
        }
    }

    /** A fenced block's language ({@code ```ts}) or a file extension. */
    public static Lang forName(String name) {
        return switch (name == null ? "" : name.toLowerCase(Locale.ROOT)) {
            case "java", "kt", "kts", "groovy", "gradle", "js", "mjs", "cjs", "jsx", "ts", "tsx", "mts", "cts",
                 "javascript", "typescript", "kotlin", "c", "h", "cpp", "cs", "go", "swift", "scala",
                 "css", "scss" -> Lang.C_LIKE;
            case "py", "python", "sh", "bash", "zsh", "shell", "ps1", "powershell", "yaml", "yml", "toml",
                 "properties", "rb", "ruby", "dockerfile", "make", "makefile", "ini", "conf" -> Lang.HASH;
            case "json", "jsonc", "json5", "mcmeta" -> Lang.JSON;
            default -> Lang.NONE;
        };
    }

    public static Result line(String text, Lang lang, boolean inBlockComment) {
        List<Span> spans = new ArrayList<>();
        if (lang == Lang.NONE || text.isEmpty() || text.length() > MAX_LINE) {
            return new Result(spans, inBlockComment && lang == Lang.C_LIKE && !text.contains("*/"));
        }
        int n = text.length();
        int i = 0;
        if (inBlockComment) {
            int close = text.indexOf("*/");
            int end = close < 0 ? n : close + 2;
            spans.add(new Span(0, end, Kind.COMMENT));
            if (close < 0) return new Result(spans, true);
            i = end;
        }
        while (i < n) {
            char c = text.charAt(i);
            if (lang != Lang.HASH && c == '/' && i + 1 < n && text.charAt(i + 1) == '/') {
                spans.add(new Span(i, n, Kind.COMMENT));
                return new Result(spans, false);
            }
            if (lang == Lang.C_LIKE && c == '/' && i + 1 < n && text.charAt(i + 1) == '*') {
                int close = text.indexOf("*/", i + 2);
                if (close < 0) {
                    spans.add(new Span(i, n, Kind.COMMENT));
                    return new Result(spans, true);
                }
                spans.add(new Span(i, close + 2, Kind.COMMENT));
                i = close + 2;
                continue;
            }
            if (lang == Lang.HASH && c == '#' && (i == 0 || Character.isWhitespace(text.charAt(i - 1)))) {
                spans.add(new Span(i, n, Kind.COMMENT));
                return new Result(spans, false);
            }
            // A ' straight after a letter is an apostrophe ("Don't"), unless that word is a string prefix
            // (Python r'…'); " and ` always open (f"…", $"…", tagged templates gql`…`).
            boolean quote = c == '"' || (c == '`' && lang == Lang.C_LIKE)
                    || (c == '\'' && (i == 0 || !isIdentPart(text.charAt(i - 1)) || isStringPrefix(text, i)));
            if (quote) {
                int end = closingQuote(text, i);
                if (lang == Lang.HASH && c == '\'' && end == n && text.charAt(n - 1) != '\'') {
                    i++; // an unclosed ' in YAML/INI prose
                    continue;
                }
                // A JSON key reads like a property, as in VS Code.
                boolean key = lang == Lang.JSON && c == '"' && nextNonSpace(text, end) == ':';
                spans.add(new Span(i, end, key ? Kind.VARIABLE : Kind.STRING));
                i = end;
                continue;
            }
            if (Character.isDigit(c) && (i == 0 || !isIdentPart(text.charAt(i - 1)))) {
                int end = i + 1;
                while (end < n && (Character.isLetterOrDigit(text.charAt(end)) || text.charAt(end) == '_'
                        || (text.charAt(end) == '.' && end + 1 < n && Character.isDigit(text.charAt(end + 1))))) end++;
                spans.add(new Span(i, end, Kind.NUMBER));
                i = end;
                continue;
            }
            if (c == '@' && lang == Lang.C_LIKE && i + 1 < n && Character.isJavaIdentifierStart(text.charAt(i + 1))) {
                int end = identEnd(text, i + 1);
                spans.add(new Span(i, end, Kind.ANNOTATION));
                i = end;
                continue;
            }
            if (Character.isJavaIdentifierStart(c)) {
                int end = identEnd(text, i);
                Kind kind = lang == Lang.HASH ? null : classify(text.substring(i, end), nextNonSpace(text, end), prevNonSpace(text, i));
                if (kind != null) spans.add(new Span(i, end, kind));
                i = end;
                continue;
            }
            i++;
        }
        return new Result(spans, false);
    }

    private static Kind classify(String word, char next, char prev) {
        boolean member = prev == '.' && !AFTER_DOT.contains(word);
        if (!member && CONTROL.contains(word)) return Kind.CONTROL;
        if (!member && KEYWORDS.contains(word)) return Kind.KEYWORD;
        if (word.length() > 1 && word.equals(word.toUpperCase(Locale.ROOT)) && word.chars().anyMatch(Character::isLetter)) {
            return Kind.CONSTANT;
        }
        if (next == '(') return Kind.FUNCTION;
        if (Character.isUpperCase(word.charAt(0))) return Kind.TYPE;
        return Kind.VARIABLE;
    }

    /** Past the closing quote (backslash escapes skipped), or the end of the line for an open string. */
    private static int closingQuote(String text, int open) {
        char q = text.charAt(open);
        for (int i = open + 1; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '\\') i++;
            else if (c == q) return i + 1;
        }
        return text.length();
    }

    private static int identEnd(String text, int start) {
        int i = start;
        while (i < text.length() && isIdentPart(text.charAt(i))) i++;
        return i;
    }

    private static boolean isIdentPart(char c) {
        return Character.isJavaIdentifierPart(c);
    }

    /** The word right before {@code quote} is one of Python's string prefixes (f, r, b, u, rb, fr…). */
    private static boolean isStringPrefix(String text, int quote) {
        int start = quote;
        while (start > 0 && isIdentPart(text.charAt(start - 1))) start--;
        return STRING_PREFIXES.contains(text.substring(start, quote).toLowerCase(Locale.ROOT));
    }

    private static char prevNonSpace(String text, int before) {
        for (int i = before - 1; i >= 0; i--) {
            if (!Character.isWhitespace(text.charAt(i))) return text.charAt(i);
        }
        return 0;
    }

    private static char nextNonSpace(String text, int from) {
        for (int i = from; i < text.length(); i++) {
            if (!Character.isWhitespace(text.charAt(i))) return text.charAt(i);
        }
        return 0;
    }
}
