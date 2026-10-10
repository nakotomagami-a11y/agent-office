package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LecternStoreTest {
    @TempDir
    Path dir;

    @Test
    void bindingsSurviveARestart() {
        Path file = dir.resolve("agentoffice-lecterns.json");
        String a = LecternStore.key("sp:World", "minecraft:overworld", 1, 64, -3);
        String b = LecternStore.key("sp:World", "minecraft:the_nether", 1, 64, -3);
        LecternStore store = new LecternStore(file);
        store.bind(a, new LecternStore.Binding("office", "Office"));
        store.bind(b, new LecternStore.Binding(LecternStore.ALL, "All projects"));

        LecternStore again = new LecternStore(file);
        assertEquals("office", again.get(a).orElseThrow().projectId());
        assertTrue(again.get(b).orElseThrow().all());
        again.unbind(a);
        assertTrue(new LecternStore(file).get(a).isEmpty());
    }

    @Test
    void aCorruptFileIsSetAsideNotLostOrOverwritten() throws Exception {
        Path file = dir.resolve("agentoffice-lecterns.json");
        Files.writeString(file, "{not json");
        LecternStore store = new LecternStore(file);
        assertTrue(store.get("x").isEmpty());
        try (var files = Files.list(dir)) {
            assertTrue(files.anyMatch(p -> p.getFileName().toString().startsWith("agentoffice-lecterns.json.corrupt-")));
        }
        store.bind("k", new LecternStore.Binding("p", "P"));
        assertEquals("p", new LecternStore(file).get("k").orElseThrow().projectId());
    }
}
