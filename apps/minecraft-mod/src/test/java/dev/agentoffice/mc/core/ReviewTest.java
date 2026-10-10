package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.List;
import org.junit.jupiter.api.Test;

class ReviewTest {
    /** As GET /api/projects/:id/reviews/:n answers (packages/domain/src/types/review.ts PullDetail). */
    private static final String DETAIL = """
            {"number":7,"title":"Add WEEK","url":"https://github.com/o/r/pull/7","author":"me","headRef":"feature/week",
             "baseRef":"main","isDraft":false,"additions":3,"deletions":1,"changedFiles":2,"reviewDecision":null,
             "updatedAt":"2026-10-10T00:00:00Z","repo":"o/r","body":"Adds WEEK.","state":"OPEN","headRefOid":"abc",
             "mergeable":"MERGEABLE","mergeStateStatus":"CLEAN","isCrossRepository":false,
             "checks":{"total":2,"passing":1,"failing":0,"pending":1},
             "notes":[{"kind":"review","author":"rowan","state":"APPROVED","body":"ok","at":"2026-10-10T00:02:00Z"}],
             "files":[
               {"path":"src/format.ts","oldPath":"src/format.ts","status":"modified","binary":false,"additions":2,"deletions":1,
                "truncated":false,"hunks":[
                 {"header":"@@ -5,2 +5,3 @@","oldStart":5,"newStart":5,"section":"","lines":[
                   {"kind":"context","text":"a","oldLine":5,"newLine":5},
                   {"kind":"del","text":"b","oldLine":6,"newLine":null},
                   {"kind":"add","text":"c","oldLine":null,"newLine":6},
                   {"kind":"add","text":"d","oldLine":null,"newLine":7}]},
                 {"header":"@@ -40 +41 @@ fn","oldStart":40,"newStart":41,"section":"fn","lines":[
                   {"kind":"context","text":"z","oldLine":40,"newLine":41}]}]},
               {"path":"logo.png","oldPath":"logo.png","status":"added","binary":true,"additions":0,"deletions":0,"truncated":false,"hunks":[]}],
             "diffUnavailable":null,
             "link":{"repo":"o/r","number":7,"projectId":"office","agentId":"developer","instanceId":"developer-abc","source":"recorded"}}
            """;

    private static JsonObject json(String s) {
        return JsonParser.parseString(s).getAsJsonObject();
    }

    @Test
    void parsesTheDetailTheServerSends() {
        Review.Detail d = Review.detail(json(DETAIL), "office", "Office");
        assertEquals(7, d.pull().number());
        assertEquals("office", d.pull().projectId());
        assertEquals("1 running", d.checks().label());
        assertFalse(d.checks().green());
        assertEquals("developer-abc", d.link().instanceId());
        assertEquals(2, d.files().size());
        Review.DiffFile f = d.files().get(0);
        assertEquals('M', f.letter());
        assertEquals("format.ts", f.name());
        assertEquals("src/", f.dir());
        assertEquals(Review.Kind.DEL, f.hunks().get(0).lines().get(1).kind());
        assertNull(f.hunks().get(0).lines().get(1).newLine());
        assertEquals("APPROVED", d.notes().get(0).state());
    }

    @Test
    void rowsFoldTheUnchangedLinesBetweenHunks() {
        Review.Detail d = Review.detail(json(DETAIL), "office", "Office");
        List<Review.Row> rows = Review.rows(d.files().get(0));
        List<Review.RowKind> kinds = rows.stream().map(Review.Row::kind).toList();
        assertEquals(List.of(Review.RowKind.GAP, Review.RowKind.HUNK, Review.RowKind.CONTEXT, Review.RowKind.DEL,
                Review.RowKind.ADD, Review.RowKind.ADD, Review.RowKind.GAP, Review.RowKind.HUNK, Review.RowKind.CONTEXT), kinds);
        assertEquals("4 unchanged lines", rows.get(0).text());
        assertEquals("33 unchanged lines", rows.get(6).text(), "new lines 8..40 between the hunks");
        assertEquals(List.of(new Review.Row(Review.RowKind.NOTE, "Binary file: not shown", null, null)), Review.rows(d.files().get(1)));
    }

    @Test
    void aQueueKeepsItsProjectAndTheTruncationFlag() {
        Review.Queue q = Review.queue(json("{\"pulls\":[{\"number\":3,\"title\":\"t\",\"isDraft\":true}],\"truncated\":true}"), "p", "P");
        assertTrue(q.truncated());
        assertEquals("P", q.pulls().get(0).projectName());
        assertTrue(q.pulls().get(0).draft());
        assertEquals("no checks", new Review.Checks(0, 0, 0, 0).label());
        assertEquals("2 checks failing", new Review.Checks(3, 1, 2, 0).label());
    }

    @Test
    void textIsShownAsWrittenNotAsFormattingOrReordering() {
        String sectionSign = new String(Character.toChars(0xA7));
        assertEquals("See ¤D4: relabel", Review.visible("See " + sectionSign + "D4: relabel"));
        String rlo = new String(Character.toChars(0x202E));
        String pdi = new String(Character.toChars(0x2069));
        assertEquals("if (isAdmin ⟦U+202E⟧ ⟦U+2069⟧) {", Review.visible("if (isAdmin " + rlo + " " + pdi + ") {"));
        assertEquals("a    b c", Review.visible("a\tb\rc"));
        String ps = new String(Character.toChars(0x2029));
        assertEquals("x;⟦U+2029⟧y", Review.visible("x;" + ps + "y"));
        assertEquals("⟦U+0000⟧x", Review.visible(new String(Character.toChars(0)) + "x"));
        assertEquals("café 新", Review.visible("café 新"));
        assertEquals("", Review.visible(null));
    }

    @Test
    void missingOptionalFieldsDoNotThrow() {
        Review.Detail d = Review.detail(json("{\"number\":1}"), "p", "P");
        assertEquals("", d.pull().title());
        assertNull(d.link());
        assertTrue(d.files().isEmpty());
        assertEquals(0, d.checks().total());
    }
}
