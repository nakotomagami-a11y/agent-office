package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The chat without its screen, against a fake Agent Office; main-thread work is pumped by the test, like a game tick. */
class ChatSessionTest {
    private static final Api.Slot SLOT = new Api.Slot("p1", "Agent Office", "developer", "developer-a1", null);
    private static final String RUNNING = """
            {"id":"c1","agentId":"developer","instanceId":"developer-a1","projectId":"p1","status":"running","activeRunId":"r2",
             "turns":[{"id":"r1","prompt":"hi","output":"hello","status":"done","origin":"user"},
                      {"id":"r2","prompt":"more","output":"","status":"running"}]}""";
    private static final String IDLE = """
            {"id":"c1","agentId":"developer","instanceId":"developer-a1","projectId":"p1","status":"idle","activeRunId":null,
             "turns":[{"id":"r1","prompt":"hi","output":"hello","status":"done","origin":"user"}]}""";

    private HttpServer server;
    private AgentOfficeClient client;
    private final ExecutorService io = Executors.newCachedThreadPool();
    private final BlockingQueue<Runnable> mainQueue = new LinkedBlockingQueue<>();
    private final List<Runnable> laters = new ArrayList<>();
    private final AtomicInteger reconnects = new AtomicInteger();
    private final AtomicInteger seatJobs = new AtomicInteger();
    private final AtomicInteger streamOpens = new AtomicInteger();
    /** Every request the fake answered: "METHOD path body". */
    private final List<String> requests = new CopyOnWriteArrayList<>();
    private volatile String conversation = IDLE;

    private final List<List<Transcript.Item>> shown = new ArrayList<>();
    private final List<String> flashes = new ArrayList<>();
    private final List<String> unsent = new ArrayList<>();

    private final ChatSession.Host host = new ChatSession.Host() {
        @Override
        public Executor io() {
            return io;
        }

        @Override
        public Executor main() {
            return mainQueue::add;
        }

        @Override
        public Executor seats() {
            return r -> {
                seatJobs.incrementAndGet();
                io.execute(r);
            };
        }

        @Override
        public void later(long millis, Runnable then) {
            laters.add(then);
        }

        @Override
        public CompletableFuture<AgentOfficeClient> reconnect() {
            reconnects.incrementAndGet();
            return CompletableFuture.completedFuture(client);
        }
    };

    private final ChatSession.Listener listener = new ChatSession.Listener() {
        @Override
        public void items(List<Transcript.Item> items) {
            shown.add(items);
        }

        @Override
        public void changed() {}

        @Override
        public void flash(String message) {
            flashes.add(message);
        }

        @Override
        public void unsent(String text) {
            unsent.add(text);
        }
    };

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.setExecutor(io);
        server.createContext("/api/conversations", ex -> {
            String path = record(ex);
            if (path.equals("/api/conversations/broken/messages")) respond(ex, 400, "{\"error\":\"text_required\"}");
            else respond(ex, 200, conversation);
        });
        server.createContext("/api/runs/r2/stream", ex -> {
            record(ex);
            streamOpens.incrementAndGet();
            ex.getResponseHeaders().add("content-type", "text/event-stream");
            ex.sendResponseHeaders(200, 0);
            try (OutputStream out = ex.getResponseBody()) {
                out.write(("event: attached\ndata: {}\n\nevent: chunk\ndata: {\"text\":\"streamed\"}\n\n"
                        + "event: done\ndata: {\"exitCode\":0}\n\n").getBytes(StandardCharsets.UTF_8));
            }
        });
        server.createContext("/api/runs/r2/permission", ex -> {
            record(ex);
            respond(ex, 200, "{\"pending\":[]}");
        });
        server.createContext("/api/projects/p1", ex -> {
            String path = record(ex);
            if (path.endsWith("/uploads")) respond(ex, 200, "{\"path\":\"/home/u/.claude/projects/p1/_uploads/pasted-1.png\"}");
            else if (ex.getRequestMethod().equals("PATCH")) respond(ex, 200, "{}");
            else respond(ex, 200, """
                    {"id":"p1","meta":{"name":"Agent Office","roster":[{"instanceId":"developer-a1","agentId":"developer","model":"opus"}]}}""");
        });
        server.createContext("/api/agents", ex -> {
            record(ex);
            respond(ex, 200, "[{\"name\":\"developer\",\"defaultModel\":\"sonnet\"}]");
        });
        server.start();
        InetSocketAddress at = server.getAddress();
        client = new AgentOfficeClient(URI.create("http://" + at.getHostString() + ":" + at.getPort()));
    }

    @AfterEach
    void stop() {
        server.stop(0);
        io.shutdownNow();
    }

    private String record(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        requests.add(ex.getRequestMethod() + " " + path + " " + new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        return path;
    }

    private static void respond(HttpExchange ex, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("content-type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }

    /** Runs main-thread work until {@code done} holds, as game ticks would. */
    private void pumpUntil(BooleanSupplier done) throws InterruptedException {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (!done.getAsBoolean()) {
            assertTrue(System.nanoTime() < until, "timed out waiting");
            Runnable r = mainQueue.poll(20, TimeUnit.MILLISECONDS);
            if (r != null) r.run();
        }
    }

    private long count(String prefix) {
        return requests.stream().filter(r -> r.startsWith(prefix)).count();
    }

    private ChatSession session() {
        return new ChatSession(host, client, SLOT, listener);
    }

    private ChatSession started() throws InterruptedException {
        ChatSession s = session();
        s.start();
        pumpUntil(() -> s.conversation() != null && s.seat() != null);
        return s;
    }

    private static boolean mentions(List<Transcript.Item> items, String text) {
        return items.stream().anyMatch(i -> i instanceof Transcript.AgentText a && a.text().contains(text));
    }

    @Test
    void readsTheConversationAndTheSeat() throws InterruptedException {
        ChatSession s = started();
        assertEquals("Idle", s.status());
        assertEquals("opus", s.seat().model());
        assertEquals("sonnet", s.agent().defaultModel());
        assertTrue(mentions(shown.get(shown.size() - 1), "hello"));
    }

    @Test
    void aRunThatEndedIsWaitedForNotFollowedAgain() throws InterruptedException {
        conversation = RUNNING;
        ChatSession s = session();
        s.start();
        pumpUntil(() -> !shown.isEmpty() && mentions(shown.get(shown.size() - 1), "streamed"));
        pumpUntil(() -> !laters.isEmpty());
        // The server still says r2 runs (another process owns it): read again, but don't re-open its stream.
        laters.remove(0).run();
        pumpUntil(() -> s.status().equals("Working… (waiting for this run to finish)"));
        assertEquals(1, streamOpens.get());
    }

    @Test
    void sendsWhatWasTypedAndRefusesNothing() throws InterruptedException {
        ChatSession s = started();
        assertFalse(s.send("   "), "nothing to send");
        assertTrue(s.send("hello there"));
        pumpUntil(() -> count("POST /api/conversations/c1/messages") == 1);
        assertTrue(requests.stream().anyMatch(r -> r.startsWith("POST /api/conversations/c1/messages") && r.contains("hello there")));
    }

    @Test
    void aFailedSendGivesItsTextAndImagesBack() throws InterruptedException {
        conversation = IDLE.replace("\"id\":\"c1\"", "\"id\":\"broken\"");
        ChatSession s = started();
        s.paste(c -> Optional.of(new ChatSession.Upload("pasted-1.png", "image/png", new byte[] {1, 2})));
        pumpUntil(() -> s.attachments().size() == 1 && s.attachments().get(0).path() != null);
        assertTrue(s.send("  keep me  "));
        assertEquals(List.of(), s.attachments(), "cleared while sending");
        pumpUntil(() -> !unsent.isEmpty());
        assertEquals(List.of("keep me"), unsent);
        assertEquals(1, s.attachments().size(), "the image comes back with the text");
        assertTrue(flashes.stream().anyMatch(f -> f.startsWith("Not sent:")));
    }

    @Test
    void aPastedImageIsUploadedThenAttachedUnderTheServersName() throws InterruptedException {
        ChatSession s = started();
        s.paste(c -> Optional.of(new ChatSession.Upload("my shot.png", "image/png", new byte[] {1, 2, 3})));
        pumpUntil(() -> !s.attachments().isEmpty() && s.attachments().get(0).path() != null);
        assertEquals(new ChatSession.Attached("pasted-1.png", "/home/u/.claude/projects/p1/_uploads/pasted-1.png"), s.attachments().get(0));
        assertEquals(1, count("POST /api/projects/p1/uploads"));
    }

    @Test
    void aClipboardThatBreaksLeavesNothingStuck() throws InterruptedException {
        ChatSession s = session();
        ChatSession.Clipboard broken = c -> {
            throw new IllegalStateException("clipboard exploded");
        };
        s.paste(broken);
        pumpUntil(() -> flashes.stream().anyMatch(f -> f.contains("clipboard exploded")));
        // Not stuck "pasting": a second paste starts again.
        int before = flashes.size();
        s.paste(c -> Optional.empty());
        pumpUntil(() -> flashes.size() > before + 1);
        assertTrue(flashes.get(flashes.size() - 1).startsWith("Nothing to paste"));
    }

    @Test
    void pickerClicksSettleIntoOnePatch() throws InterruptedException {
        ChatSession s = started();
        int jobs = seatJobs.get();
        s.changeSeat("model", "haiku");
        s.changeSeat("model", "sonnet");
        for (int i = 1; i < ChatSession.SEAT_PATCH_DELAY_TICKS; i++) s.tick();
        assertEquals(jobs, seatJobs.get(), "nothing sent while the clicks settle");
        s.tick();
        pumpUntil(() -> count("PATCH /api/projects/p1/roster/developer-a1") == 1);
        assertTrue(requests.stream().anyMatch(r -> r.startsWith("PATCH") && r.contains("\"model\":\"sonnet\"")));
        assertEquals("sonnet", s.seat().model());
    }

    @Test
    void closingSendsAPickerChangeStillSettling() throws InterruptedException {
        ChatSession s = started();
        s.changeSeat("effort", "max");
        s.close();
        pumpUntil(() -> count("PATCH /api/projects/p1/roster/developer-a1") == 1);
        assertTrue(requests.stream().anyMatch(r -> r.startsWith("PATCH") && r.contains("\"effort\":\"max\"")));
    }

    @Test
    void nothingArrivesOnceClosed() throws InterruptedException {
        ChatSession s = session();
        s.start();
        s.close();
        // Both replies (conversation and seat) are queued for the main thread, then dropped there.
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (mainQueue.size() < 2) {
            assertTrue(System.nanoTime() < until, "the replies came back");
            Thread.sleep(10);
        }
        while (!mainQueue.isEmpty()) mainQueue.poll().run();
        assertEquals(List.of(), shown);
        assertEquals(null, s.conversation());
        assertEquals(null, s.seat());
    }

    @Test
    void repeatedFailuresLookForAgentOfficeAgain() throws InterruptedException {
        server.stop(0);
        ChatSession s = session();
        s.start();
        for (int i = 0; i < ChatSession.FAILURES_BEFORE_REDISCOVERY; i++) {
            pumpUntil(() -> s.status().startsWith("Could not load") && (!laters.isEmpty() || reconnects.get() > 0));
            if (reconnects.get() > 0) break;
            laters.remove(0).run();
        }
        pumpUntil(() -> reconnects.get() == 1);
    }

    @Test
    void statusReadsLikeTheWebChat() {
        assertEquals("Idle", ChatSession.statusText(new Api.Conversation("c", "a", "i", "p", "idle", null, List.of(), 0)));
        assertEquals("Working…  ·  2 queued",
                ChatSession.statusText(new Api.Conversation("c", "a", "i", "p", "running", "r", List.of(), 2)));
    }
}
