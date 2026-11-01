package dev.agentoffice.mc.core;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.function.Consumer;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/**
 * This client's connection to Agent Office. A client that answered is used without asking /api/health again for
 * {@link #TRUST_MS}; after that, after a call through it failed to reach it, or on {@link #recheck}, it is asked
 * again, and if it no longer answers (Agent Office picks a new port on every launch) every candidate is tried. Callers
 * asking while a check runs all wait on that one check.
 */
public final class Connection {
    static final long TRUST_MS = 30_000;

    private final Executor io;
    private final Supplier<List<URI>> candidates;
    private final Consumer<AgentOfficeClient> onFound;
    private final LongSupplier clockMs;

    private AgentOfficeClient client;
    private long trustedUntil = Long.MIN_VALUE;
    /** Counts lost trust: a check that saw it change while running doesn't trust what it found. */
    private long distrusts;
    private CompletableFuture<AgentOfficeClient> checking;

    /**
     * {@code io} runs the checks, which block on HTTP: a pool, never the game's main thread. {@code onFound} runs there
     * for each newly found client, before anyone gets it.
     */
    public Connection(Executor io, Supplier<List<URI>> candidates, Consumer<AgentOfficeClient> onFound) {
        this(io, candidates, onFound, () -> System.nanoTime() / 1_000_000);
    }

    Connection(Executor io, Supplier<List<URI>> candidates, Consumer<AgentOfficeClient> onFound, LongSupplier clockMs) {
        this.io = io;
        this.candidates = candidates;
        this.onFound = onFound;
        this.clockMs = clockMs;
    }

    /** The trusted client at once; otherwise a copy of the check that is running, or of a new one. */
    public synchronized CompletableFuture<AgentOfficeClient> get() {
        if (client != null && clockMs.getAsLong() < trustedUntil) return CompletableFuture.completedFuture(client);
        CompletableFuture<AgentOfficeClient> check = checking;
        if (check == null) {
            CompletableFuture<AgentOfficeClient> started = new CompletableFuture<>();
            check = checking = started;
            AgentOfficeClient current = client;
            long seen = distrusts;
            try {
                io.execute(() -> run(started, current, seen));
            } catch (RuntimeException e) {
                checking = null; // a check that never runs must not be waited on forever
                started.completeExceptionally(e);
            }
        }
        // A copy each: one caller cancelling its future must not fail everyone else's.
        return check.copy();
    }

    /** Asks the current client again, whatever its trust: a caller saw it fail. */
    public synchronized CompletableFuture<AgentOfficeClient> recheck() {
        distrust();
        return get();
    }

    /**
     * A call through {@code failed} ended in {@code e}. An HTTP error status ({@link Api.ApiException}) means Agent
     * Office answered; anything else may mean it moved, so the next {@link #get} checks first.
     */
    public synchronized void failed(AgentOfficeClient failed, IOException e) {
        if (!(e instanceof Api.ApiException) && failed == client) distrust();
    }

    private void distrust() {
        trustedUntil = Long.MIN_VALUE;
        distrusts++;
    }

    /** Settles the connection before the check's callers see its result, so a call they make finds it current. */
    private void run(CompletableFuture<AgentOfficeClient> check, AgentOfficeClient current, long seen) {
        AgentOfficeClient found;
        try {
            found = check(current);
        } catch (Throwable t) {
            settle(check, null, seen);
            check.completeExceptionally(t);
            return;
        }
        settle(check, found, seen);
        check.complete(found);
    }

    private synchronized void settle(CompletableFuture<AgentOfficeClient> check, AgentOfficeClient found, long seen) {
        if (checking == check) checking = null;
        if (found == null) return;
        client = found;
        trustedUntil = distrusts == seen ? clockMs.getAsLong() + TRUST_MS : Long.MIN_VALUE;
    }

    private AgentOfficeClient check(AgentOfficeClient current) {
        if (current != null && current.healthy()) return current;
        List<URI> uris = candidates.get();
        if (uris.isEmpty()) {
            throw new IllegalStateException(new IOException("baseUrl must be this machine, e.g. http://127.0.0.1:3000"));
        }
        AgentOfficeClient found = AgentOfficeClient.connect(uris).orElse(null);
        if (found == null) throw new IllegalStateException(new IOException("not_running: tried " + uris));
        onFound.accept(found);
        return found;
    }
}
