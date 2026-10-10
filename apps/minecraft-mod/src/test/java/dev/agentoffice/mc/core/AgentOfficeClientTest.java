package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.Closeable;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Against a fake Agent Office that answers with the real API's shapes. */
class AgentOfficeClientTest {
    private HttpServer server;
    private AgentOfficeClient client;
    private final ExecutorService pool = Executors.newCachedThreadPool();
    private final Map<String, String> lastBody = new ConcurrentHashMap<>();
    private final Map<String, String> lastHeaders = new ConcurrentHashMap<>();

    private static final String VIEW = """
            {"id":"c1","agentId":"developer","instanceId":"developer-a1","projectId":"p1","status":"running",
             "activeRunId":"r2","sessionId":null,"queue":[{"id":"q"}],
             "turns":[{"id":"r1","prompt":"hi","output":"hello","status":"done","origin":"user","tokensIn":1200,"tokensOut":34,
                       "cost":0.05,"durMs":4000,"exitCode":0,"model":"opus","effort":"high",
                       "toolCalls":[{"id":"t1","name":"Read","input":"{\\"file_path\\":\\"a.ts\\"}","ts":1}]},
                      {"id":"r2","prompt":"more","output":"","status":"running"}]}""";

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.setExecutor(pool);
        route("/api/health", 200, "{\"available\":true,\"version\":\"2.1.0 (Claude Code)\"}");
        route("/api/projects/broken", 200, "{not json");
        route("/api/projects", 200, """
                [{"id":"p1","name":"Agent Office","shelved":false},{"id":"old","name":"Old","shelved":true}]""");
        route("/api/projects/p1", 200, """
                {"id":"p1","meta":{"name":"Agent Office","roster":[
                  {"instanceId":"developer-a1","agentId":"developer"},
                  {"instanceId":"qa-b2","agentId":"qa-code-review","label":"Reviewer","model":"haiku","effort":"low"}]}}""");
        route("/api/conversations", 200, VIEW);
        route("/api/conversations/c1/messages", 200, VIEW);
        route("/api/conversations/busted/messages", 400, "{\"error\":\"text_required\"}");
        server.createContext("/api/runs/r2/stream", ex -> {
            ex.getResponseHeaders().add("content-type", "text/event-stream");
            ex.sendResponseHeaders(200, 0);
            try (OutputStream out = ex.getResponseBody()) {
                out.write(("event: attached\ndata: {\"output\":\"he\"}\n\n: keepalive\n\n"
                        + "event: chunk\ndata: {\"text\":\"llo\"}\n\n"
                        + "event: done\ndata: {\"exitCode\":0}\n\n").getBytes(StandardCharsets.UTF_8));
            }
        });
        server.start();
        client = new AgentOfficeClient(URI.create("http://127.0.0.1:" + server.getAddress().getPort()));
    }

    @AfterEach
    void stop() {
        server.stop(0);
        pool.shutdownNow();
    }

    private void route(String path, int status, String body) {
        server.createContext(path, ex -> {
            if (ex.getRequestHeaders().containsKey("Upgrade")) {
                ex.close(); // what Agent Office's Node server does with an h2c upgrade: no response at all
                return;
            }
            if (!ex.getRequestURI().getPath().equals(path)) {
                respond(ex, 404, "{\"error\":\"not_found\"}");
                return;
            }
            lastBody.put(path, new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            lastHeaders.put(path, String.valueOf(ex.getRequestHeaders().containsKey("Origin")));
            respond(ex, status, body);
        });
    }

    private static void respond(HttpExchange ex, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("content-type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }

    @Test
    void connectSkipsDeadCandidates() {
        URI dead = URI.create("http://127.0.0.1:1");
        assertEquals(client.base(), AgentOfficeClient.connect(List.of(dead, client.base())).orElseThrow().base());
        assertTrue(AgentOfficeClient.connect(List.of(dead)).isEmpty());
    }

    @Test
    void shelvedProjectsAreHidden() throws IOException {
        assertEquals(List.of(new Api.Project("p1", "Agent Office", 0)), client.projects());
    }

    @Test
    void rosterBecomesSlots() throws IOException {
        List<Api.Slot> slots = client.roster(new Api.Project("p1", "Agent Office", 0));
        assertEquals(2, slots.size());
        assertEquals("developer", slots.get(0).displayName());
        assertEquals("Reviewer", slots.get(1).displayName());
        assertEquals("p1", slots.get(1).projectId());
    }

    @Test
    void openSendsTheSlotAndParsesTheView() throws IOException {
        Api.Conversation c = client.open(new Api.Slot("p1", "Agent Office", "developer", "developer-a1", null));
        assertEquals("{\"agentId\":\"developer\",\"instanceId\":\"developer-a1\",\"projectId\":\"p1\"}",
                lastBody.get("/api/conversations"));
        assertEquals("false", lastHeaders.get("/api/conversations"), "Agent Office's guard rejects cross-origin writes");
        assertTrue(c.running());
        assertEquals(2, c.turns().size());
        assertEquals(new Api.Turn("r1", "hi", "hello", "done", "user",
                List.of(new Api.ToolCall("t1", "Read", "{\"file_path\":\"a.ts\"}")), 1200, 34, 0.05, 4000, 0, "opus", "high"),
                c.turns().get(0));
        assertEquals(List.of(), c.turns().get(1).toolCalls());
        assertEquals(1, c.queued());
    }

    @Test
    void currentIsAReadOnlyGetAndNullMeansNoConversation() throws IOException {
        AtomicReference<String> seen = new AtomicReference<>();
        server.removeContext("/api/conversations");
        server.createContext("/api/conversations", ex -> {
            seen.set(ex.getRequestMethod() + " " + ex.getRequestURI().getRawQuery());
            boolean known = ex.getRequestURI().getRawQuery().contains("developer-a1");
            respond(ex, 200, known ? VIEW : "null");
        });
        Api.Slot dev = new Api.Slot("p1", "Agent Office", "developer", "developer-a1", null);
        assertEquals("running", client.current(dev).orElseThrow().status());
        assertEquals("GET agentId=developer&instanceId=developer-a1", seen.get());
        assertTrue(client.current(new Api.Slot("p1", "x", "developer", "never-used", null)).isEmpty());
    }

    @Test
    void sendPostsTheText() throws IOException {
        client.send("c1", "build the mod");
        assertEquals("{\"text\":\"build the mod\"}", lastBody.get("/api/conversations/c1/messages"));
    }

    @Test
    void apiErrorsCarryTheServerCode() {
        Api.ApiException e = assertThrows(Api.ApiException.class, () -> client.send("busted", "x"));
        assertEquals(400, e.status);
        assertEquals("text_required", e.code);
    }

    @Test
    void streamDeliversEventsInOrderThenEndsCleanly() throws InterruptedException {
        List<Api.Event> got = new ArrayList<>();
        AtomicReference<Throwable> failure = new AtomicReference<>(new Throwable("not ended"));
        CountDownLatch ended = new CountDownLatch(1);
        client.stream("r2", pool, got::add, err -> {
            failure.set(err);
            ended.countDown();
        });
        assertTrue(ended.await(5, TimeUnit.SECONDS));
        assertNull(failure.get());
        assertEquals(List.of("attached", "chunk", "done"), got.stream().map(Api.Event::name).toList());
    }

    @Test
    void closingAStreamEndsItWithoutAnError() throws Exception {
        CountDownLatch opened = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        server.createContext("/api/runs/slow/stream", ex -> {
            ex.sendResponseHeaders(200, 0);
            OutputStream out = ex.getResponseBody();
            out.write("event: chunk\ndata: {}\n\n".getBytes(StandardCharsets.UTF_8));
            out.flush();
            opened.countDown();
            try {
                release.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            out.close();
        });
        AtomicReference<Throwable> failure = new AtomicReference<>(new Throwable("not ended"));
        CountDownLatch ended = new CountDownLatch(1);
        Closeable handle = client.stream("slow", pool, e -> { }, err -> {
            failure.set(err);
            ended.countDown();
        });
        assertTrue(opened.await(5, TimeUnit.SECONDS));
        handle.close();
        boolean endedBeforeServerClosed = ended.await(3, TimeUnit.SECONDS);
        release.countDown();
        assertTrue(endedBeforeServerClosed, "close() must unblock the reader");
        assertNull(failure.get());
    }

    @Test
    void someOtherAppAnsweringHealthIsNotAgentOffice() throws IOException {
        HttpServer other = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        other.createContext("/api/health", ex -> respond(ex, 200, "{\"ok\":true}"));
        other.start();
        try {
            URI otherUri = URI.create("http://127.0.0.1:" + other.getAddress().getPort());
            assertFalse(new AgentOfficeClient(otherUri).healthy(), "chat text must never go to a stranger on :3000");
            assertEquals(client.base(), AgentOfficeClient.connect(List.of(otherUri, client.base())).orElseThrow().base());
        } finally {
            other.stop(0);
        }
    }

    @Test
    void aMalformedResponseIsAnIOExceptionNotACrash() {
        assertThrows(IOException.class, () -> client.roster(new Api.Project("broken", "Broken", 0)));
    }

    @Test
    void instancesKeepTheSeatsOverrides() throws IOException {
        List<Api.Instance> seats = client.instances(new Api.Project("p1", "Agent Office", 2));
        assertNull(seats.get(0).model());
        assertEquals("haiku", seats.get(1).model());
        assertEquals("low", seats.get(1).effort());
    }

    /** Records "METHOD path body" for every request to {@code path}, answering {@code body}. */
    private List<String> record(String path, int status, String body) {
        List<String> seen = new ArrayList<>();
        server.createContext(path, ex -> {
            synchronized (seen) {
                seen.add(ex.getRequestMethod() + " " + ex.getRequestURI().getRawPath() + " "
                        + new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            }
            respond(ex, status, body);
        });
        return seen;
    }

    @Test
    void seatManagementUsesTheRosterEndpoints() throws IOException {
        List<String> add = record("/api/projects/p2/roster", 200, "{\"project\":{},\"instance\":{\"instanceId\":\"developer-new1\",\"agentId\":\"developer\"}}");
        List<String> one = record("/api/projects/p2/roster/dev-1", 200, "{}");
        Api.Slot seat = new Api.Slot("p2", "P2", "developer", "dev-1", null);
        assertEquals("developer-new1", client.addInstance("p2", "developer", false));
        client.addInstance("p2", "developer", true);
        com.google.gson.JsonObject patch = new com.google.gson.JsonObject();
        patch.addProperty("model", "");
        client.patchInstance(seat, patch);
        client.removeInstance(seat);
        assertEquals(List.of(
                "POST /api/projects/p2/roster {\"agentId\":\"developer\"}",
                "POST /api/projects/p2/roster {\"agentId\":\"developer\",\"force\":true}"), add);
        assertEquals(List.of(
                "PATCH /api/projects/p2/roster/dev-1 {\"model\":\"\"}",
                "DELETE /api/projects/p2/roster/dev-1 "), one);
    }

    @Test
    void aFullProjectIsATypedError() {
        record("/api/projects/full/roster", 409, "{\"error\":\"INSTANCE_CAP_EXCEEDED\",\"softCap\":true,\"count\":5}");
        Api.ApiException e = assertThrows(Api.ApiException.class, () -> client.addInstance("full", "developer", false));
        assertEquals("INSTANCE_CAP_EXCEEDED", e.code);
        assertTrue(e.softCap);
        record("/api/projects/maxed/roster", 409, "{\"error\":\"INSTANCE_CAP_EXCEEDED\",\"softCap\":false,\"count\":10}");
        assertFalse(assertThrows(Api.ApiException.class, () -> client.addInstance("maxed", "developer", true)).softCap,
                "the hard cap can't be forced: no 'Add anyway'");
    }

    @Test
    void stopAndConversationActions() throws IOException {
        List<String> abort = record("/api/runs/r2/abort", 200, "{\"aborted\":true}");
        List<String> retry = record("/api/conversations/c1/retry", 200, VIEW);
        assertTrue(client.abort("r2"));
        assertEquals("c1", client.act("c1", "retry").id());
        assertEquals(List.of("POST /api/runs/r2/abort {}"), abort);
        assertEquals(List.of("POST /api/conversations/c1/retry {}"), retry);
    }

    @Test
    void permissionsAreReadAndAnswered() throws IOException {
        List<String> seen = record("/api/runs/r2/permission", 200, """
                {"pending":[{"id":"p-1","runId":"r2","tool":"Bash","input":{"command":"ls"},"createdAt":1}]}""");
        assertEquals(List.of(new Api.Permission("p-1", "r2", "Bash", "{\"command\":\"ls\"}")), client.permissions("r2"));
        client.answerPermission("r2", "p-1", false);
        assertEquals("PATCH /api/runs/r2/permission {\"id\":\"p-1\",\"decision\":\"deny\"}", seen.get(1));
    }

    @Test
    void bytesRefusesAnythingTooLarge() throws IOException {
        server.createContext("/api/img.png", ex -> {
            ex.sendResponseHeaders(200, 10);
            try (OutputStream out = ex.getResponseBody()) {
                out.write(new byte[10]);
            }
        });
        assertEquals(10, client.bytes("/api/img.png", 10).length);
        assertThrows(IOException.class, () -> client.bytes("/api/img.png", 9));
    }

    @Test
    void aReadOnlyClientNeverChangesAgentOfficeButCanStillOpenAChat() throws IOException {
        List<String> abort = record("/api/runs/r2/abort", 200, "{\"aborted\":true}");
        AgentOfficeClient ro = new AgentOfficeClient(client.base()).readOnly();
        Api.Slot seat = new Api.Slot("p1", "Agent Office", "developer", "developer-a1", null);
        assertEquals("c1", ro.open(seat).id());
        // The guard's own error, not a 404 from the fake server: deleting a guard must fail this test.
        List<org.junit.jupiter.api.function.Executable> writes = List.of(
                () -> ro.send("c1", "hi"),
                () -> ro.act("c1", "new"),
                () -> ro.abort("r2"),
                () -> ro.answerPermission("r2", "p-1", true),
                () -> ro.addInstance("p1", "developer", false),
                () -> ro.patchInstance(seat, new com.google.gson.JsonObject()),
                () -> ro.removeInstance(seat));
        for (org.junit.jupiter.api.function.Executable write : writes) {
            IOException e = assertThrows(IOException.class, write);
            assertTrue(e.getMessage().startsWith("read_only"), e.getMessage());
        }
        assertEquals(List.of(), abort, "nothing reached the server");
        assertEquals(null, lastBody.get("/api/conversations/c1/messages"));
    }

    @Test
    void healthIsFalseWhenNothingListens() {
        assertFalse(new AgentOfficeClient(URI.create("http://127.0.0.1:1")).healthy());
    }
}
