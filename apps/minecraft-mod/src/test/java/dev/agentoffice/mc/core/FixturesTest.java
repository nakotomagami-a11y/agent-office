package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The client against what the real server answers: apps/server/src/minecraft-mod-fixtures.test.ts calls the route
 * handlers and keeps their responses in src/test/resources/.../fixtures. Parsing is lenient, so a field the server
 * renamed reads as null or 0; these assert that every field the mod reads comes through.
 */
class FixturesTest {
    private static final Api.Project ALPHA = new Api.Project("alpha", "alpha", 1);
    private static final Api.Slot SEAT = new Api.Slot("alpha", "alpha", "developer", "developer-fx01", null);

    private HttpServer server;
    private AgentOfficeClient client;
    private final ExecutorService pool = Executors.newCachedThreadPool();

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(pool);
        serve("/api/projects", "projects.json", "application/json");
        serve("/api/projects/alpha", "project.json", "application/json");
        serve("/api/projects/alpha/roster", "roster-add.json", "application/json");
        serve("/api/projects/alpha/reviews", "reviews.json", "application/json");
        serve("/api/projects/alpha/reviews/7", "review.json", "application/json");
        serve("/api/agents", "agents.json", "application/json");
        serve("/api/ui-settings", "ui-settings.json", "application/json");
        serve("/api/conversations", "conversation.json", "application/json");
        serve("/api/runs/run-live/permission", "permissions.json", "application/json");
        serve("/api/runs/run-stream/stream", "stream.txt", "text/event-stream");
        server.start();
        client = new AgentOfficeClient(URI.create("http://127.0.0.1:" + server.getAddress().getPort()));
    }

    @AfterEach
    void stop() {
        server.stop(0);
        pool.shutdownNow();
    }

    private void serve(String path, String fixture, String type) throws IOException {
        byte[] body = fixture(fixture);
        server.createContext(path, ex -> {
            if (!ex.getRequestURI().getPath().equals(path)) {
                ex.sendResponseHeaders(404, -1);
                ex.close();
                return;
            }
            ex.getResponseHeaders().add("content-type", type);
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream out = ex.getResponseBody()) {
                out.write(body);
            }
        });
    }

    private static byte[] fixture(String name) throws IOException {
        try (InputStream in = FixturesTest.class.getResourceAsStream("/dev/agentoffice/mc/fixtures/" + name)) {
            assertNotNull(in, name + " is on the test classpath");
            return in.readAllBytes();
        }
    }

    @Test
    void projectsAndTheirSeats() throws IOException {
        assertEquals(List.of(ALPHA), client.projects());
        Api.Instance seat = client.instances(ALPHA).getFirst();
        assertEquals(new Api.Slot("alpha", "alpha", "developer", "developer-fx01", "Builder"), seat.slot());
        assertEquals(List.of("sonnet", "low", "plan"), List.of(seat.model(), seat.effort(), seat.permissionMode()));
        assertEquals("Builder", seat.sessionName());
        assertEquals("developer-fx01", client.addInstance("alpha", "developer", false));
    }

    @Test
    void agentsWithTheirDefaultsAndNames() throws IOException {
        assertEquals(List.of(new Api.Agent("developer", "Writes code.", "opus", "high")), client.agents());
        assertEquals("Dev", AgentNames.of("developer"));
    }

    @Test
    void theDesktopAppsOpenTabs() throws IOException {
        assertEquals(List.of("alpha", "beta"), client.openTabs());
    }

    @Test
    void aRunningConversation() throws IOException {
        Api.Conversation c = client.current(SEAT).orElseThrow();
        assertEquals(List.of("conv-1", "developer", "developer-fx01", "alpha"), List.of(c.id(), c.agentId(), c.instanceId(), c.projectId()));
        assertTrue(c.running(), "status and activeRunId");
        assertEquals("run-live", c.activeRunId());
        assertEquals(1, c.queued());
        Api.Turn done = c.turns().getFirst();
        assertEquals(List.of("run-done", "Read a.ts", "Read it.", Protocol.Turn.DONE, "opus", "high"),
                List.of(done.runId(), done.prompt(), done.output(), done.status(), done.model(), done.effort()));
        assertFalse(done.fromSystem());
        assertEquals(List.of(1200L, 34L, 4000L), List.of(done.tokensIn(), done.tokensOut(), done.durMs()));
        assertEquals(0.05, done.cost(), 1e-9);
        assertEquals(0, done.exitCode());
        assertEquals(List.of(new Api.ToolCall("toolu-1", "Read", "{\"file_path\":\"a.ts\"}")), done.toolCalls());
        assertEquals("a.ts", ((Transcript.Tool) Transcript.history(c).get(1)).arg());
    }

    @Test
    void aPendingPermission() throws IOException {
        assertEquals(List.of(new Api.Permission("perm-1", "run-live", "Bash", "{\"command\":\"rm -rf build\"}")), client.permissions("run-live"));
    }

    @Test
    void everyStreamEventTheTranscriptReads() throws Exception {
        List<Api.Event> events = new ArrayList<>();
        CompletableFuture<Throwable> end = new CompletableFuture<>();
        client.stream("run-stream", pool, events::add, end::complete);
        assertNull(end.get(5, TimeUnit.SECONDS));
        Transcript.Live live = new Transcript.Live();
        for (Api.Event e : events) assertTrue(live.apply(e), "a known event: " + e.name());
        assertTrue(live.ended());
        assertEquals(List.of(
                new Transcript.AgentText("Looking.", false),
                new Transcript.Tool("toolu-2", "Read", "a.ts", false),
                new Transcript.SubAgent("sub-1", "qa-code-review", Protocol.SubAgent.ERROR, null, "Reading the diff"),
                new Transcript.RateLimit("Approaching your usage limit", false),
                new Transcript.Failure("auth_expired", "Log in again"),
                new Transcript.Done(1, 9000, 2400, 80, 0.12)), live.items());
    }

    @Test
    void theSubAgentUpdateCarriesItsTool() throws Exception {
        List<Api.Event> events = new ArrayList<>();
        CompletableFuture<Throwable> end = new CompletableFuture<>();
        client.stream("run-stream", pool, events::add, end::complete);
        end.get(5, TimeUnit.SECONDS);
        Transcript.Live live = new Transcript.Live();
        for (Api.Event e : events) {
            if (e.name().equals(Protocol.Event.ERROR)) break;
            live.apply(e);
        }
        assertEquals("qa-code-review", live.runningTool());
        assertTrue(live.items().contains(new Transcript.SubAgent("sub-1", "qa-code-review", Protocol.SubAgent.RUNNING, "Grep", "Reading the diff")));
    }

    @Test
    void aPullRequestQueueAndOnePull() throws IOException {
        Review.Pull pull = client.pulls("alpha", "alpha").pulls().getFirst();
        assertEquals(new Review.Pull("alpha", "alpha", 7, "Add WEEK", "https://github.com/Owner/Repo/pull/7", "Someone",
                "agent/developer-fx01-1716800000000", "main", false, 3, 2, 1, null, "2026-10-10T00:00:00Z"), pull);
        Review.Detail d = client.pull("alpha", "alpha", 7);
        assertEquals(pull, d.pull());
        assertEquals(List.of("owner/repo", "Adds WEEK.", "OPEN", "a".repeat(40), "CLEAN"),
                List.of(d.repo(), d.body(), d.state(), d.headRefOid(), d.mergeStateStatus()));
        assertEquals(new Review.Checks(2, 2, 0, 0), d.checks());
        assertEquals(new Review.Note("review", "rowan", "COMMENTED", "looks fine", "2026-10-10T00:02:00Z"), d.notes().get(1));
        assertEquals(new Review.Link("developer", "developer-fx01", Protocol.PrLink.BRANCH), d.link());
        assertNull(d.diffUnavailable());
        Review.DiffFile f = d.files().getFirst();
        assertEquals(List.of("src/format.ts", "src/format.ts", "modified"), List.of(f.path(), f.oldPath(), f.status()));
        assertEquals(List.of(3, 2), List.of(f.additions(), f.deletions()));
        Review.Hunk h = f.hunks().get(1);
        assertEquals(List.of("@@ -40,2 +41,2 @@ function later() {", "function later() {"), List.of(h.header(), h.section()));
        assertEquals(List.of(40, 41), List.of(h.oldStart(), h.newStart()));
        assertEquals(new Review.Line(Review.Kind.DEL, "  return 1;", 40, null), h.lines().getFirst());
        assertEquals(new Review.Line(Review.Kind.ADD, "  return 2;", null, 41), h.lines().get(1));
    }
}
