package dev.agentoffice.mc.core;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;

/**
 * Pull-request review, as /api/projects/:id/reviews serves it (packages/domain/src/types/review.ts).
 * See docs/minecraft-review-lectern.md.
 */
public final class Review {
    private Review() {}

    /** One open PR in a lectern's queue; the project it belongs to travels with it ("All projects"). */
    public record Pull(String projectId, String projectName, int number, String title, String url, String author,
                       String headRef, String baseRef, boolean draft, int additions, int deletions, int changedFiles,
                       String reviewDecision, String updatedAt) {}

    public record Queue(List<Pull> pulls, boolean truncated) {}

    public enum Kind { CONTEXT, ADD, DEL }

    public record Line(Kind kind, String text, Integer oldLine, Integer newLine) {}

    public record Hunk(String header, int oldStart, int newStart, String section, List<Line> lines) {}

    public record DiffFile(String path, String oldPath, String status, boolean binary, int additions, int deletions,
                           boolean truncated, List<Hunk> hunks) {
        /** M / A / D / R, as the files list shows it. */
        public char letter() {
            return switch (status) {
                case "added" -> 'A';
                case "deleted" -> 'D';
                case "renamed" -> 'R';
                default -> 'M';
            };
        }

        public String name() {
            int slash = path.lastIndexOf('/');
            return slash < 0 ? path : path.substring(slash + 1);
        }

        /** The folder part, with its trailing slash; "" at the repo root. */
        public String dir() {
            int slash = path.lastIndexOf('/');
            return slash < 0 ? "" : path.substring(0, slash + 1);
        }
    }

    public record Checks(int total, int passing, int failing, int pending) {
        public boolean green() {
            return failing == 0 && pending == 0;
        }

        public String label() {
            if (total == 0) return "no checks";
            if (failing > 0) return failing + (failing == 1 ? " check failing" : " checks failing");
            if (pending > 0) return pending + " running";
            return "checks pass";
        }
    }

    /** A review or comment on the PR. {@code state} is null for a plain comment. */
    public record Note(String kind, String author, String state, String body, String at) {}

    /** The seat this PR's feedback goes to; source = recorded | branch | manual. */
    public record Link(String agentId, String instanceId, String source) {}

    public record Detail(Pull pull, String repo, String body, String state, String headRefOid, String mergeStateStatus,
                         Checks checks, List<Note> notes, List<DiffFile> files, String diffUnavailable, Link link) {}

    public static Queue queue(JsonObject o, String projectId, String projectName) {
        List<Pull> pulls = new ArrayList<>();
        for (JsonElement el : arr(o, "pulls")) pulls.add(pull(el.getAsJsonObject(), projectId, projectName));
        return new Queue(pulls, bool(o, "truncated"));
    }

    public static Detail detail(JsonObject o, String projectId, String projectName) {
        List<Note> notes = new ArrayList<>();
        for (JsonElement el : arr(o, "notes")) {
            JsonObject n = el.getAsJsonObject();
            notes.add(new Note(str(n, "kind"), str(n, "author"), str(n, "state"), nz(str(n, "body")), str(n, "at")));
        }
        List<DiffFile> files = new ArrayList<>();
        for (JsonElement el : arr(o, "files")) files.add(file(el.getAsJsonObject()));
        JsonObject c = o.has("checks") && o.get("checks").isJsonObject() ? o.getAsJsonObject("checks") : new JsonObject();
        Checks checks = new Checks(num(c, "total"), num(c, "passing"), num(c, "failing"), num(c, "pending"));
        Link link = null;
        if (o.has("link") && o.get("link").isJsonObject()) {
            JsonObject l = o.getAsJsonObject("link");
            link = new Link(str(l, "agentId"), str(l, "instanceId"), str(l, "source"));
        }
        return new Detail(pull(o, projectId, projectName), str(o, "repo"), nz(str(o, "body")), str(o, "state"),
                str(o, "headRefOid"), str(o, "mergeStateStatus"), checks, notes, files, str(o, "diffUnavailable"), link);
    }

    private static Pull pull(JsonObject p, String projectId, String projectName) {
        return new Pull(projectId, projectName, num(p, "number"), nz(str(p, "title")), str(p, "url"), nz(str(p, "author")),
                nz(str(p, "headRef")), nz(str(p, "baseRef")), bool(p, "isDraft"), num(p, "additions"), num(p, "deletions"),
                num(p, "changedFiles"), str(p, "reviewDecision"), str(p, "updatedAt"));
    }

    private static DiffFile file(JsonObject f) {
        List<Hunk> hunks = new ArrayList<>();
        for (JsonElement el : arr(f, "hunks")) {
            JsonObject h = el.getAsJsonObject();
            List<Line> lines = new ArrayList<>();
            for (JsonElement le : arr(h, "lines")) {
                JsonObject l = le.getAsJsonObject();
                Kind kind = switch (nz(str(l, "kind"))) {
                    case "add" -> Kind.ADD;
                    case "del" -> Kind.DEL;
                    default -> Kind.CONTEXT;
                };
                lines.add(new Line(kind, nz(str(l, "text")), integer(l, "oldLine"), integer(l, "newLine")));
            }
            hunks.add(new Hunk(nz(str(h, "header")), num(h, "oldStart"), num(h, "newStart"), nz(str(h, "section")), lines));
        }
        String path = nz(str(f, "path"));
        String oldPath = str(f, "oldPath");
        return new DiffFile(path, oldPath == null ? path : oldPath, nz(str(f, "status")), bool(f, "binary"),
                num(f, "additions"), num(f, "deletions"), bool(f, "truncated"), hunks);
    }

    /** What the diff panel draws, top to bottom: file-level notes, hunk headers, folded gaps, lines. */
    public enum RowKind { HUNK, GAP, NOTE, CONTEXT, ADD, DEL }

    public record Row(RowKind kind, String text, Integer oldLine, Integer newLine) {}

    public static List<Row> rows(DiffFile f) {
        List<Row> out = new ArrayList<>();
        if (f.binary()) {
            out.add(new Row(RowKind.NOTE, "Binary file: not shown", null, null));
            return out;
        }
        if (f.hunks().isEmpty()) {
            out.add(new Row(RowKind.NOTE, f.status().equals("renamed")
                    ? "Renamed from " + f.oldPath() + ", no content changes" : "No content changes", null, null));
            return out;
        }
        int nextNew = 1;
        for (Hunk h : f.hunks()) {
            int hidden = h.newStart() - nextNew;
            if (hidden > 0) out.add(new Row(RowKind.GAP, hidden + (hidden == 1 ? " unchanged line" : " unchanged lines"), null, null));
            out.add(new Row(RowKind.HUNK, h.header(), null, null));
            for (Line l : h.lines()) {
                RowKind kind = switch (l.kind()) {
                    case ADD -> RowKind.ADD;
                    case DEL -> RowKind.DEL;
                    case CONTEXT -> RowKind.CONTEXT;
                };
                out.add(new Row(kind, l.text(), l.oldLine(), l.newLine()));
                if (l.newLine() != null) nextNew = l.newLine() + 1;
            }
            // A pure-deletion hunk (+9,0) has no new-side lines: it sits after new line 9.
            if (h.lines().stream().allMatch(l -> l.newLine() == null)) nextNew = Math.max(nextNew, h.newStart() + 1);
        }
        if (f.truncated()) out.add(new Row(RowKind.NOTE, "File cut here: too many changed lines to show", null, null));
        return out;
    }

    /**
     * Text from a PR as it may be drawn by Minecraft's font, which would otherwise act on it: {@code §}
     * starts a formatting code (§0 hides the rest of the line, §k scrambles it), and bidi controls
     * (U+202E …) reorder what is shown — "Trojan Source" code would read as something else. Formatting
     * and control characters become a visible ⟦U+XXXX⟧, § becomes ¤, a tab four spaces.
     */
    public static String visible(String s) {
        if (s == null || s.isEmpty()) return "";
        StringBuilder out = new StringBuilder(s.length());
        s.codePoints().forEach(cp -> {
            if (cp == '\t') out.append("    ");
            else if (cp == '§') out.append('¤');
            else if (cp == '\r' || cp == '\n') out.append(' ');
            else if (escaped(Character.getType(cp))) {
                out.append(String.format("⟦U+%04X⟧", cp));
            } else out.appendCodePoint(cp);
        });
        return out.toString();
    }

    /** Invisible or layout-changing: format/control characters, and U+2028/U+2029, which start a new bidi paragraph. */
    private static boolean escaped(int type) {
        return type == Character.FORMAT || type == Character.CONTROL
                || type == Character.LINE_SEPARATOR || type == Character.PARAGRAPH_SEPARATOR;
    }

    private static JsonArray arr(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el != null && el.isJsonArray() ? el.getAsJsonArray() : new JsonArray();
    }

    private static String str(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el == null || el.isJsonNull() ? null : el.getAsString();
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static int num(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el == null || el.isJsonNull() ? 0 : el.getAsInt();
    }

    private static Integer integer(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el == null || el.isJsonNull() ? null : el.getAsInt();
    }

    private static boolean bool(JsonObject o, String key) {
        JsonElement el = o.get(key);
        return el != null && el.isJsonPrimitive() && el.getAsBoolean();
    }
}
