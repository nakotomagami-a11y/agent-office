package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class BodyStoreTest {
    @TempDir
    Path dir;

    private static final Api.Slot DEV = new Api.Slot("p1", "Agent Office", "developer", "developer-a1", null);
    private static final Api.Slot QA = new Api.Slot("p1", "Agent Office", "qa-code-review", "qa-b2", "Reviewer");

    private BodyStore.Body body(String world, String dim, Api.Slot slot, double x) {
        return new BodyStore.Body(world, dim, x, 64, 0, 90f, slot);
    }

    @Test
    void placementsSurviveAReload() {
        Path file = dir.resolve("bodies.json");
        new BodyStore(file).place(body("sp:Dev", "minecraft:overworld", QA, 1.5));
        BodyStore reloaded = new BodyStore(file);
        assertEquals(List.of(body("sp:Dev", "minecraft:overworld", QA, 1.5)), reloaded.in("sp:Dev", "minecraft:overworld"));
    }

    @Test
    void bodiesAreScopedToWorldAndDimension() {
        BodyStore store = new BodyStore(dir.resolve("b.json"));
        store.place(body("sp:Dev", "minecraft:overworld", DEV, 0));
        store.place(body("sp:Other", "minecraft:overworld", QA, 0));
        assertEquals(1, store.in("sp:Dev", "minecraft:overworld").size());
        assertEquals(0, store.in("sp:Dev", "minecraft:the_nether").size());
    }

    @Test
    void placingTheSameSeatAgainMovesIt() {
        BodyStore store = new BodyStore(dir.resolve("b.json"));
        store.place(body("sp:Dev", "minecraft:overworld", DEV, 0));
        store.place(body("sp:Dev", "minecraft:the_nether", DEV, 9));
        assertEquals(List.of(), store.in("sp:Dev", "minecraft:overworld"));
        assertEquals(9, store.in("sp:Dev", "minecraft:the_nether").get(0).x());
    }

    @Test
    void aShellSurvivesAReloadAndSetupMakesItThatSeatsBodyWhereItStands() {
        Path file = dir.resolve("b.json");
        BodyStore store = new BodyStore(file);
        store.place(body("sp:Dev", "minecraft:overworld", DEV, 0));
        BodyStore.Body shell = store.place(BodyStore.Body.shell("sp:Dev", "minecraft:overworld", 5, 70, 5, 45f));
        assertTrue(shell.isShell());

        BodyStore reloaded = new BodyStore(file);
        assertEquals(2, reloaded.in("sp:Dev", "minecraft:overworld").size());
        BodyStore.Body assigned = reloaded.assign("sp:Dev", shell.shell(), DEV);
        assertEquals(new BodyStore.Body("sp:Dev", "minecraft:overworld", 5, 70, 5, 45f, DEV), assigned);
        // The seat's old body is gone: one body per seat per world.
        assertEquals(List.of(assigned), reloaded.in("sp:Dev", "minecraft:overworld"));
        assertEquals(List.of(assigned), new BodyStore(file).in("sp:Dev", "minecraft:overworld"));
        assertEquals(null, reloaded.assign("sp:Dev", shell.shell(), QA), "a shell is set up once");
    }

    @Test
    void aShellCanBeRemovedWithoutTouchingSeats() {
        BodyStore store = new BodyStore(dir.resolve("b.json"));
        store.place(body("sp:Dev", "minecraft:overworld", DEV, 0));
        BodyStore.Body shell = store.place(BodyStore.Body.shell("sp:Dev", "minecraft:overworld", 1, 64, 1, 0f));
        assertTrue(store.removeShell("sp:Dev", shell.shell()));
        assertEquals(1, store.in("sp:Dev", "minecraft:overworld").size());
        assertTrue(store.has("sp:Dev", DEV));
    }

    @Test
    void removeOnlyForgetsThatWorldsBody() {
        BodyStore store = new BodyStore(dir.resolve("b.json"));
        store.place(body("sp:Dev", "minecraft:overworld", DEV, 0));
        store.place(body("sp:Other", "minecraft:overworld", DEV, 0));
        assertTrue(store.remove("sp:Dev", DEV));
        assertFalse(store.has("sp:Dev", DEV));
        assertTrue(store.has("sp:Other", DEV));
        assertFalse(store.remove("sp:Dev", DEV));
    }

    @Test
    void aCorruptFileIsSetAsideNotOverwritten() throws IOException {
        Path file = dir.resolve("b.json");
        Files.writeString(file, "[{\"world\":");
        BodyStore store = new BodyStore(file);
        assertEquals(List.of(), store.in("sp:Dev", "minecraft:overworld"));
        Path setAside;
        try (var files = Files.list(dir)) {
            setAside = files.filter(p -> p.getFileName().toString().startsWith("b.json.corrupt-")).findFirst().orElseThrow();
        }
        assertEquals("[{\"world\":", Files.readString(setAside), "the player's data must be recoverable");
        store.place(body("sp:Dev", "minecraft:overworld", DEV, 0));
        assertEquals(1, new BodyStore(file).in("sp:Dev", "minecraft:overworld").size());
    }

    @Test
    void badBytesAreCorruptionSetAsideNotARetryForever() throws IOException {
        Path file = dir.resolve("b.json");
        Files.write(file, new byte[] {(byte) 0xFF, (byte) 0xFE, (byte) 0xFD});
        BodyStore store = new BodyStore(file);
        store.place(body("sp:Dev", "minecraft:overworld", DEV, 0));
        assertEquals(1, new BodyStore(file).in("sp:Dev", "minecraft:overworld").size(), "the new placement is saved");
        try (var files = Files.list(dir)) {
            assertEquals(1, files.filter(p -> p.getFileName().toString().startsWith("b.json.corrupt-")).count());
        }
    }

    /** Throws like a file held by a scanner for the first {@code lockedReads} reads. */
    private static BodyStore.Reader lockedFor(int lockedReads) {
        int[] calls = {0};
        return f -> {
            if (calls[0]++ < lockedReads) throw new IOException("The process cannot access the file");
            return Files.readString(f);
        };
    }

    @Test
    void aFileLockedAtStartupIsMergedOnTheNextSaveNotLost() throws IOException {
        Path file = dir.resolve("b.json");
        new BodyStore(file).place(body("sp:Dev", "minecraft:overworld", QA, 7));
        BodyStore store = new BodyStore(file, lockedFor(1));
        assertEquals(List.of(), store.in("sp:Dev", "minecraft:overworld"), "nothing known yet while locked");
        store.place(body("sp:Dev", "minecraft:overworld", DEV, 1));
        List<BodyStore.Body> onDisk = new BodyStore(file).in("sp:Dev", "minecraft:overworld");
        assertEquals(2, onDisk.size(), "the earlier body survives next to the new one");
    }

    @Test
    void aRemovalWhileLockedIsNotUndoneByTheMerge() throws IOException {
        Path file = dir.resolve("b.json");
        BodyStore first = new BodyStore(file);
        first.place(body("sp:Dev", "minecraft:overworld", QA, 7));
        first.place(body("sp:Dev", "minecraft:overworld", DEV, 1));
        BodyStore store = new BodyStore(file, lockedFor(1));
        store.remove("sp:Dev", QA);
        assertEquals(List.of(DEV), new BodyStore(file).in("sp:Dev", "minecraft:overworld").stream().map(BodyStore.Body::slot).toList());
    }

    @Test
    void stillLockedAtSaveTimeWritesNothing() throws IOException {
        Path file = dir.resolve("b.json");
        new BodyStore(file).place(body("sp:Dev", "minecraft:overworld", QA, 7));
        String before = Files.readString(file);
        BodyStore store = new BodyStore(file, lockedFor(Integer.MAX_VALUE));
        store.place(body("sp:Dev", "minecraft:overworld", DEV, 1));
        assertTrue(store.has("sp:Dev", DEV), "the placement still works for this session");
        assertEquals(before, Files.readString(file), "a file we couldn't read must not be replaced");
    }

    @Test
    void oneBadEntryIsSkippedAndTheRestLoad() throws IOException {
        Path file = dir.resolve("b.json");
        Files.writeString(file, """
                [{"dimension":"minecraft:overworld","x":0,"y":0,"z":0,"yaw":0,
                  "slot":{"projectId":"p1","agentId":"developer","instanceId":"developer-a1"}},
                 {"world":"sp:Dev","dimension":"minecraft:overworld","x":"not a number","y":0,"z":0,"yaw":0,
                  "slot":{"projectId":"p1","agentId":"qa","instanceId":"qa-b2"}},
                 {"world":"sp:Dev","dimension":"minecraft:overworld","x":2,"y":64,"z":0,"yaw":90,
                  "slot":{"projectId":"p1","agentId":"developer","instanceId":"developer-a1"}}]""");
        List<BodyStore.Body> loaded = new BodyStore(file).in("sp:Dev", "minecraft:overworld");
        assertEquals(1, loaded.size(), "missing world and a bad number are skipped, not fatal");
        assertEquals(2, loaded.get(0).x());
    }

    @Test
    void aFailedSaveKeepsTheBodyAndDoesNotThrow() throws IOException {
        Path blocker = dir.resolve("not-a-dir");
        Files.writeString(blocker, "x");
        BodyStore store = new BodyStore(blocker.resolve("b.json"));
        store.place(body("sp:Dev", "minecraft:overworld", DEV, 0));
        assertTrue(store.has("sp:Dev", DEV), "a write failure must never crash the game or lose the placement");
    }
}
