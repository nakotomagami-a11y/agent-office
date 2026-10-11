package dev.agentoffice.mc.client.service;

import dev.agentoffice.mc.ModPaths;
import dev.agentoffice.mc.client.ClientSetup;
import dev.agentoffice.mc.client.DevHooks;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Async;
import dev.agentoffice.mc.core.ChatSession;
import dev.agentoffice.mc.core.Discovery;
import dev.agentoffice.mc.core.Ids;
import dev.agentoffice.mc.core.LecternStore;
import dev.agentoffice.mc.core.Review;
import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import net.minecraft.client.Minecraft;

/**
 * Agent Office as this client reaches it: the connection, and every call to it run off the render thread with its
 * outcome back on it. Screens call through here and start no threads of their own (rule mod.screen-no-io).
 */
public final class AgentOffice {
    public interface Call<T> {
        T run(AgentOfficeClient client) throws IOException;
    }

    public static final ExecutorService IO = Executors.newCachedThreadPool(Ids.daemon("io"));
    /** Seat reads and writes, one at a time and in order, even across closing and reopening a chat. */
    public static final Executor SEATS = Executors.newSingleThreadExecutor(Ids.daemon("seat"));

    private static volatile AgentOfficeClient client;

    /** Where every chat's session works: these threads, its results on the game's main thread. */
    public static final ChatSession.Host CHAT = new ChatSession.Host() {
        @Override
        public Executor io() {
            return IO;
        }

        @Override
        public Executor main() {
            return AgentOffice.main();
        }

        @Override
        public Executor seats() {
            return SEATS;
        }

        @Override
        public void later(long millis, Runnable then) {
            AgentOffice.later(millis, () -> true, then);
        }

        @Override
        public CompletableFuture<AgentOfficeClient> reconnect() {
            return client();
        }
    };

    private AgentOffice() {}

    /** Reuses a healthy client; otherwise rediscovers (the app's port changes on every launch). */
    public static CompletableFuture<AgentOfficeClient> client() {
        return CompletableFuture.supplyAsync(() -> {
            AgentOfficeClient current = client;
            if (current != null && current.healthy()) return current;
            List<URI> candidates = Discovery.candidates(ClientSetup.BASE_URL.get(), ModPaths.home());
            if (candidates.isEmpty()) {
                throw new IllegalStateException(new IOException("baseUrl must be this machine, e.g. http://127.0.0.1:3000"));
            }
            // A local: two rediscoveries can race, and the field may be reset by the other one.
            AgentOfficeClient found = AgentOfficeClient.connect(candidates).orElse(null);
            if (found == null) throw new IllegalStateException(new IOException("not_running: tried " + candidates));
            // A scripted dev check must never send, stop or edit anything, whatever input reaches its window.
            if (DevHooks.active()) found.readOnly();
            client = found;
            // Learns the agents' names (AgentNames) in the background: until then ids made readable do, and nobody
            // waiting for this client should wait on it.
            IO.execute(() -> {
                try {
                    found.agents();
                } catch (IOException | RuntimeException e) {
                    // The next read of the agent list tries again.
                }
            });
            return found;
        }, IO);
    }

    /** Connects (or reuses the connection), then calls; the outcome arrives on the main thread while {@code alive} holds. */
    public static <T> void call(BooleanSupplier alive, Call<T> call, Consumer<T> ok, Consumer<Exception> failed) {
        Async.run(IO, main(), alive, () -> call.run(connected()), ok, failed);
    }

    /** Calls through a client already in hand (a screen's own, which may be a reconnect behind). */
    public static <T> void call(AgentOfficeClient c, BooleanSupplier alive, Call<T> call, Consumer<T> ok, Consumer<Exception> failed) {
        Async.run(IO, main(), alive, () -> call.run(c), ok, failed);
    }

    /** {@code then}, on the main thread, after {@code millis}, if {@code alive} still holds. */
    public static void later(long millis, BooleanSupplier alive, Runnable then) {
        CompletableFuture.delayedExecutor(millis, TimeUnit.MILLISECONDS, IO).execute(() -> main().execute(() -> {
            if (alive.getAsBoolean()) then.run();
        }));
    }

    /** A lectern's pull requests; "All projects" reads every project at once on these threads. Blocking. */
    public static Review.Gathered reviews(AgentOfficeClient client, LecternStore.Binding binding) throws IOException {
        return Review.gather(client, binding, IO);
    }

    public static Executor main() {
        return Minecraft.getInstance()::execute;
    }

    private static AgentOfficeClient connected() {
        return client().join();
    }
}
