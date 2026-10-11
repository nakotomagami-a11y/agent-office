package dev.agentoffice.mc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * The mod's layer rules (docs/conventions.md, ids mod.*), checked on the source text with comments removed: an
 * import or a fully qualified name in code both count, a mention in a comment does not.
 */
class ArchitectureTest {
    private static final Path SRC = Path.of("src", "main", "java", "dev", "agentoffice", "mc");

    /** {@code code}: no comments, string literals emptied; {@code withStrings}: no comments, strings kept. */
    private record Source(String pkg, Path file, String code, String withStrings) {}

    private static List<Source> sources() throws IOException {
        List<Source> out = new ArrayList<>();
        try (Stream<Path> files = Files.walk(SRC)) {
            for (Path f : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                String raw = Files.readString(f);
                String pkg = SRC.relativize(f.getParent()).toString().replace('\\', '/');
                out.add(new Source(pkg, f, scan(raw, false), scan(raw, true)));
            }
        }
        assertTrue(out.size() > 50, "found the mod's sources under " + SRC.toAbsolutePath());
        return out;
    }

    /** The source without comments; each string, char or text block literal kept, or emptied to its quotes. */
    static String scan(String java, boolean keepStrings) {
        StringBuilder out = new StringBuilder();
        int i = 0;
        int n = java.length();
        while (i < n) {
            if (java.startsWith("//", i)) {
                while (i < n && java.charAt(i) != '\n') i++;
            } else if (java.startsWith("/*", i)) {
                int end = java.indexOf("*/", i + 2);
                i = end < 0 ? n : end + 2;
                out.append(' ');
            } else if (java.charAt(i) == '"' || java.charAt(i) == '\'') {
                String quote = java.startsWith("\"\"\"", i) ? "\"\"\"" : String.valueOf(java.charAt(i));
                int end = i + quote.length();
                while (end < n && !java.startsWith(quote, end)) end += java.charAt(end) == '\\' ? 2 : 1;
                end = Math.min(n, end + quote.length());
                out.append(keepStrings ? java.substring(i, end) : quote + quote);
                i = end;
            } else {
                out.append(java.charAt(i++));
            }
        }
        return out.toString();
    }

    private static List<String> violations(List<Source> all, Predicate<Source> in, Pattern forbidden) {
        List<String> out = new ArrayList<>();
        for (Source s : all) {
            if (!in.test(s)) continue;
            Matcher m = forbidden.matcher(s.code());
            while (m.find()) out.add(s.file() + ": " + m.group());
        }
        return out;
    }

    @Test
    void coreIsPureJava() throws IOException {
        // mod.core-pure: core/ runs (and is tested) without Minecraft.
        Predicate<Source> core = s -> s.pkg().equals("core") || s.pkg().startsWith("core/");
        Pattern imports = Pattern.compile("^import\\s+(?:static\\s+)?([\\w.]+)", Pattern.MULTILINE);
        List<String> bad = new ArrayList<>();
        for (Source s : sources()) {
            if (!core.test(s)) continue;
            Matcher m = imports.matcher(s.code());
            while (m.find()) {
                String name = m.group(1);
                if (!(name.startsWith("java.") || name.startsWith("com.google.gson.") || name.startsWith("org.slf4j.")
                        || name.startsWith("dev.agentoffice.mc.core."))) bad.add(s.file() + ": " + name);
            }
        }
        // A name written out in full needs no import.
        bad.addAll(violations(sources(), core,
                Pattern.compile("net\\.minecraft\\.|net\\.neoforged\\.|com\\.mojang\\.|dev\\.agentoffice\\.mc\\.(?!core\\b)\\w")));
        assertEquals(List.of(), bad, "mod.core-pure");
    }

    @Test
    void commonCodeNeverReachesTheClient() throws IOException {
        // mod.common-no-client: a dedicated server never loads client classes.
        assertEquals(List.of(), violations(sources(), s -> !s.pkg().equals("client") && !s.pkg().startsWith("client/"),
                Pattern.compile("dev\\.agentoffice\\.mc\\.client|net\\.minecraft\\.client|com\\.mojang\\.blaze3d")),
                "mod.common-no-client");
    }

    @Test
    void uiWidgetsAreALeaf() throws IOException {
        // mod.ui-leaf: widgets know nothing of screens, services or renderers.
        assertEquals(List.of(), violations(sources(), s -> s.pkg().equals("client/ui"),
                Pattern.compile("dev\\.agentoffice\\.mc\\.client\\.(screen|service|render)")), "mod.ui-leaf");
    }

    @Test
    void apiPathsAreBuiltInOnePlace() throws IOException {
        // mod.api-paths-one-place: core/Routes mirrors API_ROUTES, and the server's contract test holds it to them.
        List<String> bad = new ArrayList<>();
        for (Source s : sources()) {
            if (!s.file().endsWith(Path.of("core", "Routes.java")) && s.withStrings().contains("/api/")) bad.add(s.file().toString());
        }
        assertEquals(List.of(), bad, "mod.api-paths-one-place");
    }

    @Test
    void screensDoNoIoOfTheirOwn() throws IOException {
        // mod.screen-no-io: screens lay out, take input and draw; services (AgentOffice, AgentStatus, WorkspaceStore,
        // ChatSession) do the work and keep the state that outlives a screen.
        Predicate<Source> screens = s -> s.pkg().equals("client/screen");
        List<String> bad = violations(sources(), screens, SCREEN_THREADS);
        bad.addAll(violations(sources(), screens, SCREEN_STATICS));
        assertEquals(List.of(), bad, "mod.screen-no-io");
    }

    /** Starting work off the render thread, or handing a screen the threads to start it on. */
    private static final Pattern SCREEN_THREADS = Pattern.compile("Executors\\.|new Thread\\b|Thread\\.(?:sleep|ofVirtual|ofPlatform|startVirtualThread)"
            + "|CompletableFuture|ForkJoinPool|parallelStream|new Timer\\b|\\.submit\\(|\\.execute\\(|AgentOffice\\.(?:IO|SEATS)\\b");
    /** A static field that isn't final, or a final one made with {@code new} or an array literal (contents can change). */
    private static final Pattern SCREEN_STATICS = Pattern.compile(
            "(?<!\\bfinal\\s{1,4})\\bstatic\\s+(?!final\\b)(?!class\\b|abstract\\b|record\\b|interface\\b|enum\\b|void\\b|<)[\\w.<>,? \\[\\]]+\\s+\\w+\\s*[=;]"
                    + "|\\b(?:static\\s+final|final\\s+static)\\s+[\\w.<>,? \\[\\]]+\\s+\\w+\\s*=\\s*(?:[^;]*\\bnew\\b|\\{)");

    @Test
    void theScreenRuleSeesEveryWayToBreakIt() {
        for (String code : List.of("static int clicks;", "private static Map<String, String> m = null;",
                "static final HashMap<String, Integer> m = new HashMap<>();", "static final int[] X = {1, 2};",
                "static final List<String> l = Collections.synchronizedList(new ArrayList<>());")) {
            assertTrue(SCREEN_STATICS.matcher(code).find(), code);
        }
        for (String code : List.of("static final int ROW = 26;", "final static int ROW = 26;", "private static String cut(Font f, String t) {",
                "private static final class Tab extends Button {", "static final ResourceLocation TAB = ResourceLocation.withDefaultNamespace(\"x\");",
                "public static <T> void call(Call<T> c) {")) {
            assertFalse(SCREEN_STATICS.matcher(code).find(), code);
        }
        for (String code : List.of("pool.submit(r)", "Thread.ofVirtual().start(r)", "list.parallelStream()", "gather(c, b, AgentOffice.IO)", "new Timer()")) {
            assertTrue(SCREEN_THREADS.matcher(code).find(), code);
        }
    }

    /** A literal used to match a value: compared, a case label, a fallback, or in a set of choices. */
    private static final Pattern COMPARED_BEFORE = Pattern.compile(
            "(?:equals|equalsIgnoreCase|orElse)\\(\\s*$|Objects\\.equals\\([^;]*$|(?:Set|List)\\.of\\([^;()]*$|case\\s[^;:>]*$");
    private static final Pattern COMPARED_AFTER = Pattern.compile("^\\s*(?:\\.equals(?:IgnoreCase)?\\(|->)");

    @Test
    void serverWordsAreComparedThroughProtocol() throws IOException {
        // mod.status-vocab: what the server sends is matched through core/Protocol and core/RunErrors, never a literal.
        Path protocol = Path.of("core", "Protocol.java");
        Path runErrors = Path.of("core", "RunErrors.java");
        Set<String> words = new HashSet<>();
        Matcher w = Pattern.compile("public static final String \\w+ = \"([^\"]+)\";|Map\\.entry\\(\"([^\"]+)\"")
                .matcher(Files.readString(SRC.resolve(protocol)) + Files.readString(SRC.resolve(runErrors)));
        while (w.find()) words.add(w.group(1) != null ? w.group(1) : w.group(2));
        assertTrue(words.contains("needs_attention") && words.contains("auth_expired"), "read Protocol's and RunErrors' words");
        // The mod's own "couldn't ask" status shares the word until part 2's AgentState replaces it.
        words.remove("unknown");
        Pattern literal = Pattern.compile("\"([\\w-]+)\"");
        List<String> bad = new ArrayList<>();
        for (Source s : sources()) {
            if (s.file().endsWith(protocol) || s.file().endsWith(runErrors)) continue;
            String code = s.withStrings();
            Matcher m = literal.matcher(code);
            while (m.find()) {
                if (!words.contains(m.group(1))) continue;
                String before = code.substring(Math.max(0, m.start() - 80), m.start());
                if (COMPARED_BEFORE.matcher(before).find() || COMPARED_AFTER.matcher(code.substring(m.end())).find()) {
                    bad.add(s.file() + ": " + code.substring(Math.max(0, m.start() - 20), Math.min(code.length(), m.end() + 10)).strip());
                }
            }
        }
        assertEquals(List.of(), bad, "mod.status-vocab");
    }

    @Test
    void theVocabRuleSeesEveryWayToCompare() {
        for (String c : List.of("\"done\".equals(x)", "x.equals(\"done\")", "x.equalsIgnoreCase(\"done\")", "o.orElse(\"done\")",
                "Objects.equals(a.b(), \"done\")", "Set.of(\"x\", \"done\").contains(y)", "case \"done\" ->", "case \"a\", \"done\" ->")) {
            String code = c;
            Matcher m = Pattern.compile("\"done\"").matcher(code);
            assertTrue(m.find(), c);
            assertTrue(COMPARED_BEFORE.matcher(code.substring(0, m.start())).find() || COMPARED_AFTER.matcher(code.substring(m.end())).find(), c);
        }
        String shown = "g.drawString(font, \"done\", x, y)";
        int at = shown.indexOf("\"done\"");
        assertFalse(COMPARED_BEFORE.matcher(shown.substring(0, at)).find() || COMPARED_AFTER.matcher(shown.substring(at + 6)).find());
    }

    @Test
    void theModIdIsTheBuildsModId() throws IOException {
        // neoforge.mods.toml is generated from gradle.properties; registries and saves use Ids.MOD_ID.
        Matcher code = Pattern.compile("MOD_ID = \"([^\"]+)\"").matcher(Files.readString(SRC.resolve(Path.of("core", "Ids.java"))));
        Matcher build = Pattern.compile("(?m)^mod_id=(\\S+)").matcher(Files.readString(Path.of("gradle.properties")));
        assertTrue(code.find() && build.find(), "read both mod ids");
        assertEquals(build.group(1), code.group(1));
    }

    @Test
    void everyDevFlagReachesTheGame() throws IOException {
        // build.gradle passes -PaoName through as agentoffice.dev.name: a flag DevHooks reads must be on its list.
        Set<String> read = new HashSet<>();
        Matcher r = Pattern.compile("\"agentoffice\\.dev\\.(\\w+)\"").matcher(Files.readString(SRC.resolve(Path.of("client", "DevHooks.java"))));
        while (r.find()) read.add(r.group(1));
        read.remove("world"); // set from gradle.properties' dev_world, not a flag
        Matcher list = Pattern.compile("\\[('[^\\]]+)\\]\\.each \\{ name ->").matcher(Files.readString(Path.of("build.gradle")));
        assertTrue(list.find(), "build.gradle's dev flag list");
        Set<String> passed = new HashSet<>();
        for (String q : list.group(1).split(",")) passed.add(q.trim().replace("'", ""));
        assertEquals(read, passed);
    }

    @Test
    void theScanDropsCommentsOnly() {
        assertTrue(scan("x = dev.agentoffice.mc.client.screen.ChatScreen.class;", false).contains("client.screen"));
        assertFalse(scan("// see dev.agentoffice.mc.client.screen\nint x;", false).contains("client.screen"));
        assertFalse(scan("String s = \"dev.agentoffice.mc.client.screen\";", false).contains("client.screen"));
        assertTrue(scan("String u = \"http://x/api/health\"; // /api/y", true).contains("/api/health"));
        assertFalse(scan("/* /api/x */ char q = '\"'; String s = \"a\\\"b\"; // /api/y", true).contains("/api/"));
        assertEquals("String t = \"\"\"\"\"\";\nint x;", scan("String t = \"\"\"\n  // in the text\n  \"\"\";\nint x;", false));
    }
}
