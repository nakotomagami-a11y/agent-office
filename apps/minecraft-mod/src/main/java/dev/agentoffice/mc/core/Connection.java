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
    private CompletableFuture<AgentOfficeClient> checking;

    /** {@code onFound} runs on {@code io} for each newly found client, before anyone gets it. */
    public Connection(Executor io, Supplier<List<URI>> candidates, Consumer<AgentOfficeClient> onFound) {
        this(io, candidates, onFound, () -> System.nanoTime() / 1_000_000);
    }

    Connection(Executor io, Supplier<List<URI>> candidates, Consumer<AgentOfficeClient> onFound, LongSupplier clockMs) {
        this.io = io;
        this.candidates = candidates;
        this.onFound = onFound;
        this.clockMs = clockMs;
    }

    /** The trusted client at once; otherwise the check that is running, or a new one. */
    public synchronized CompletableFuture<AgentOfficeClient> get() {
        if (client != null && clockMs.getAsLong() < trustedUntil) return CompletableFuture.completedFuture(client);
        if (checking != null) return checking;
        AgentOfficeClient current = client;
        CompletableFuture<AgentOfficeClient> check = CompletableFuture.supplyAsync(() -> check(current), io);
        checking = check;
        check.whenComplete((found, err) -> settle(check, found));
        return check;
    }

    /** Asks the current client again, whatever its trust: a caller saw it fail. */
    public synchronized CompletableFuture<AgentOfficeClient> recheck() {
        trustedUntil = Long.MIN_VALUE;
        return get();
    }

    /** A call through {@code failed} didn't reach it: the next {@link #get} checks it first. */
    public synchronized void failed(AgentOfficeClient failed) {
        if (failed == client) trustedUntil = Long.MIN_VALUE;
    }

    private synchronized void settle(CompletableFuture<AgentOfficeClient> check, AgentOfficeClient found) {
        if (checking == check) checking = null;
        if (found == null) return;
        client = found;
        trustedUntil = clockMs.getAsLong() + TRUST_MS;
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
