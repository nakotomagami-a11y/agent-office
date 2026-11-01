package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** Against fake Agent Offices that count how often /api/health is asked; the test runs the io thread's work by hand. */
class ConnectionTest {
    private final List<HttpServer> servers = new ArrayList<>();
    private final List<Runnable> io = new ArrayList<>();
    private final AtomicLong now = new AtomicLong(1_000);
    private final List<URI> candidates = new ArrayList<>();
    private final List<AgentOfficeClient> found = new ArrayList<>();
    private final Connection connection = new Connection(io::add, () -> List.copyOf(candidates), found::add, now::get);

    private record Fake(HttpServer server, URI uri, AtomicInteger health) {}

    private Fake fake() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicInteger health = new AtomicInteger();
        server.createContext("/api/health", ex -> {
            health.incrementAndGet();
            byte[] body = "{\"available\":true,\"version\":\"2.1.0\"}".getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream out = ex.getResponseBody()) {
                out.write(body);
            }
        });
        server.start();
        servers.add(server);
        return new Fake(server, URI.create("http://127.0.0.1:" + server.getAddress().getPort()), health);
    }

    @AfterEach
    void stop() {
        servers.forEach(s -> s.stop(0));
    }

    /** Runs what the connection queued on its io thread, then the answer. */
    private AgentOfficeClient run(CompletableFuture<AgentOfficeClient> f) {
        while (!io.isEmpty()) io.remove(0).run();
        return f.join();
    }

    @Test
    void aClientThatAnsweredIsTrustedWithoutAskingAgain() throws IOException {
        Fake app = fake();
        candidates.add(app.uri());
        AgentOfficeClient c = run(connection.get());
        assertEquals(1, app.health().get());
        for (int i = 0; i < 5; i++) {
            CompletableFuture<AgentOfficeClient> again = connection.get();
            assertTrue(again.isDone(), "no health check while trusted");
            assertSame(c, again.join());
        }
        assertEquals(1, app.health().get());
        assertEquals(List.of(c), found);

        now.addAndGet(Connection.TRUST_MS);
        assertSame(c, run(connection.get()));
        assertEquals(2, app.health().get(), "asked again once the trust ran out");
        assertEquals(List.of(c), found, "the same client again is not newly found");
    }

    @Test
    void callersDuringACheckShareIt() throws IOException {
        Fake app = fake();
        candidates.add(app.uri());
        CompletableFuture<AgentOfficeClient> first = connection.get();
        CompletableFuture<AgentOfficeClient> second = connection.get();
        CompletableFuture<AgentOfficeClient> third = connection.recheck();
        assertEquals(1, io.size(), "one discovery for all three");
        first.cancel(true);
        AgentOfficeClient c = run(second);
        assertSame(c, third.join(), "one caller cancelling fails nobody else");
        assertEquals(1, app.health().get());
        assertEquals(1, found.size());
    }

    @Test
    void anHttpErrorKeepsTheTrustAndAFailureToReachItDoesNot() throws IOException {
        Fake app = fake();
        candidates.add(app.uri());
        AgentOfficeClient c = run(connection.get());
        connection.failed(c, new Api.ApiException(500, "internal"));
        assertTrue(connection.get().isDone(), "Agent Office answered");
        connection.failed(c, new ConnectException("refused"));
        assertFalse(connection.get().isDone(), "may have moved: asked first");
    }

    @Test
    void aFailureDuringACheckIsNotForgotten() throws IOException {
        Fake app = fake();
        candidates.add(app.uri());
        AgentOfficeClient c = run(connection.get());
        now.addAndGet(Connection.TRUST_MS);
        CompletableFuture<AgentOfficeClient> check = connection.get();
        connection.failed(c, new ConnectException("refused")); // a call that was already on its way
        assertSame(c, run(check));
        assertFalse(connection.get().isDone(), "the check's answer predates the failure: asked again");
    }

    @Test
    void theConnectionIsSettledBeforeAnyCallerHearsOfIt() throws IOException {
        Fake app = fake();
        candidates.add(app.uri());
        CompletableFuture<AgentOfficeClient> f = connection.get();
        // A call that fails at once, as the caller's first act: had it come before the connection took this client
        // on, it would be ignored and the client then trusted.
        f.thenAccept(c -> connection.failed(c, new ConnectException("refused")));
        run(f);
        assertFalse(connection.get().isDone(), "a failure as the caller's first act is not lost");
    }

    @Test
    void aNewClientIsPreparedBeforeAnyoneGetsIt() throws IOException {
        Fake app = fake();
        candidates.add(app.uri());
        List<Boolean> doneWhenPrepared = new ArrayList<>();
        List<CompletableFuture<AgentOfficeClient>> pending = new ArrayList<>();
        Connection c = new Connection(io::add, () -> List.copyOf(candidates), found -> doneWhenPrepared.add(pending.get(0).isDone()), now::get);
        pending.add(c.get());
        run(pending.get(0));
        assertEquals(List.of(false), doneWhenPrepared);

        Connection broken = new Connection(io::add, () -> List.copyOf(candidates), found -> {
            throw new IllegalStateException("prepare failed");
        }, now::get);
        assertThrows(CompletionException.class, () -> run(broken.get()));
        assertFalse(broken.get().isDone(), "nothing was trusted: tried again");
    }

    @Test
    void worksOnAnExecutorThatRunsAtOnce() throws IOException {
        // The check then completes inside get(): it must still be cleared, or every later ask would get this answer.
        Fake app = fake();
        candidates.add(app.uri());
        Connection direct = new Connection(Runnable::run, () -> List.copyOf(candidates), x -> {}, now::get);
        AgentOfficeClient c = direct.get().join();
        now.addAndGet(Connection.TRUST_MS);
        assertSame(c, direct.get().join());
        assertEquals(2, app.health().get());
    }

    @Test
    void aFailedCallOrARecheckAsksAgainAndFollowsANewPort() throws IOException {
        Fake old = fake();
        candidates.add(old.uri());
        AgentOfficeClient c = run(connection.get());

        connection.failed(new AgentOfficeClient(old.uri()), new ConnectException("refused"));
        assertTrue(connection.get().isDone(), "a failure through another client says nothing about this one");

        connection.failed(c, new ConnectException("refused"));
        assertSame(c, run(connection.get()), "still answering: kept");
        assertEquals(2, old.health().get());

        // Agent Office restarts on another port.
        old.server().stop(0);
        Fake moved = fake();
        candidates.add(0, moved.uri());
        AgentOfficeClient next = run(connection.recheck());
        assertEquals(moved.uri(), next.base());
        assertEquals(List.of(c, next), found);
        assertTrue(connection.get().isDone(), "the new one is trusted");
    }

    @Test
    void nothingAnsweringFailsAndTheNextAskTriesAgain() throws IOException {
        CompletionException none = assertThrows(CompletionException.class, () -> run(connection.get()));
        assertTrue(Async.message(none).startsWith("baseUrl must be this machine"), Async.message(none));

        candidates.add(URI.create("http://127.0.0.1:1"));
        CompletionException dead = assertThrows(CompletionException.class, () -> run(connection.get()));
        assertTrue(Async.message(dead).startsWith("not_running: tried"), Async.message(dead));

        Fake app = fake();
        candidates.add(app.uri());
        assertEquals(app.uri(), run(connection.get()).base());
    }
}
