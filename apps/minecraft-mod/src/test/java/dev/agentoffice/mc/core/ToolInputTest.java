package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.google.gson.JsonPrimitive;
import org.junit.jupiter.api.Test;

class ToolInputTest {
    @Test
    void storedInputParsesOrStaysRaw() {
        assertNull(ToolInput.parse(null));
        assertNull(ToolInput.parse("  "));
        assertEquals("a.ts", ToolInput.parse("{\"file_path\":\"a.ts\"}").getAsJsonObject().get("file_path").getAsString());
        assertEquals(new JsonPrimitive("{not json"), ToolInput.parse("{not json"));
    }

    @Test
    void aToolRowShowsItsMainFieldOnOneLine() {
        assertEquals("pnpm test && pnpm lint", ToolInput.summary(ToolInput.parse("{\"command\":\"pnpm test\\n&& pnpm lint\",\"timeout\":5}")));
        // The first key on the list wins, whatever the order in the input.
        assertEquals("src", ToolInput.summary(ToolInput.parse("{\"pattern\":\"*.ts\",\"path\":\"src\"}")));
        assertEquals("{\"n\":1}", ToolInput.summary(ToolInput.parse("{\"n\":1}")), "no main field: the JSON");
        assertEquals("{\"command\":5}", ToolInput.summary(ToolInput.parse("{\"command\":5}")), "only a string is a main field");
        assertEquals("raw text", ToolInput.summary(ToolInput.parse("  raw text ")));
        assertEquals("[1]", ToolInput.summary(ToolInput.parse("[1]")));
        assertNull(ToolInput.summary(ToolInput.parse("{}")));
        assertNull(ToolInput.summary(ToolInput.parse("[]")));
        assertNull(ToolInput.summary(ToolInput.parse("null")));
        assertNull(ToolInput.summary(null));
    }

    @Test
    void anApprovalShowsItsMainFieldAsWritten() {
        assertEquals("cd x\nrm -rf build", ToolInput.detail("{\"command\":\"cd x\\nrm -rf build\",\"description\":\"clean\"}"));
        assertEquals("https://example.com", ToolInput.detail("{\"url\":\"https://example.com\",\"prompt\":\"summarise\"}"));
        assertEquals("{\"n\":1}", ToolInput.detail("{\"n\":1}"));
        // The tool row's key list: path before url, and only a string counts.
        assertEquals("a", ToolInput.detail("{\"url\":\"u\",\"path\":\"a\"}"));
        assertEquals("{\"command\":5}", ToolInput.detail("{\"command\":5}"));
        assertEquals("{not json", ToolInput.detail("{not json"));
        assertEquals("\"just a string\"", ToolInput.detail("\"just a string\""));
        assertEquals("", ToolInput.detail(null));
    }

    @Test
    void theHoverShowsEverythingIndented() {
        assertEquals("{\n  \"file_path\": \"a.ts\",\n  \"content\": \"line 1\nline 2    <b>\"\n}",
                ToolInput.pretty("{\"file_path\":\"a.ts\",\"content\":\"line 1\\nline 2\\t<b>\"}"));
        assertEquals("{not json", ToolInput.pretty("{not json"));
        assertEquals("(no input)", ToolInput.pretty(null));
    }
}
