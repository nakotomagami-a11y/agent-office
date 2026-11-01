package dev.agentoffice.mc.client.service;

import dev.agentoffice.mc.ModPaths;
import dev.agentoffice.mc.client.ClientSetup;
import dev.agentoffice.mc.client.DevHooks;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Async;
import dev.agentoffice.mc.core.ChatSession;
import dev.agentoffice.mc.core.Connection;
import dev.agentoffice.mc.core.Discovery;
import dev.agentoffice.mc.core.Ids;
import dev.agentoffice.mc.core.LecternStore;
import dev.agentoffice.mc.core.Review;
import java.io.IOException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.Function;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

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

    private static final Connection CONNECTION =
            new Connection(IO, () -> Discovery.candidates(ClientSetup.BASE_URL.get(), ModPaths.home()), AgentOffice::found);

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
            return CONNECTION.recheck();
        }
    };

    /** Main thread only (see {@link #openWhenConnected}). */
    private static boolean opening;

    private AgentOffice() {}

    /** The connection (see {@link Connection}): rediscovered when it stops answering, as the app's port changes on every launch. */
    public static CompletableFuture<AgentOfficeClient> client() {
        return CONNECTION.get();
    }

    private static void found(AgentOfficeClient found) {
        // A scripted dev check must never send, stop or edit anything, whatever input reaches its window.
        if (DevHooks.active()) found.readOnly();
        // Learns the agents' names (AgentNames) in the background: until then ids made readable do, and nobody
        // waiting for this client should wait on it.
        IO.execute(() -> {
            try {
                found.agents();
            } catch (IOException | RuntimeException e) {
                // The next read of the agent list tries again.
            }
        });
    }

    /** Connects (or reuses the connection), then calls; the outcome arrives on the main thread while {@code alive} holds. */
    public static <T> void call(BooleanSupplier alive, Call<T> call, Consumer<T> ok, Consumer<Exception> failed) {
        Async.run(IO, main(), alive, () -> through(connected(), call), ok, failed);
    }

    /** Calls through a client already in hand (a screen's own, which may be a reconnect behind). */
    public static <T> void call(AgentOfficeClient c, BooleanSupplier alive, Call<T> call, Consumer<T> ok, Consumer<Exception> failed) {
        Async.run(IO, main(), alive, () -> through(c, call), ok, failed);
    }

    /** As {@link #call(AgentOfficeClient, BooleanSupplier, Call, Consumer, Consumer)}, in line with every other seat read and write. */
    public static <T> void seatCall(AgentOfficeClient c, BooleanSupplier alive, Call<T> call, Consumer<T> ok, Consumer<Exception> failed) {
        Async.run(SEATS, main(), alive, () -> through(c, call), ok, failed);
    }

    private static <T> T through(AgentOfficeClient c, Call<T> call) throws IOException {
        try {
            return call.run(c);
        } catch (IOException e) {
            failed(c, e);
            throw e;
        }
    }

    /** A call through {@code c} failed with {@code e}, which the caller handles itself: Agent Office may have moved. */
    public static void failed(AgentOfficeClient c, IOException e) {
        CONNECTION.failed(c, e);
    }

    /**
     * Connects, then opens what {@code screen} makes of the client, unless the player opened something else or left the
     * world meanwhile; null opens nothing. Main thread only: one pending open at a time, however fast the player clicks.
     * Always asks Agent Office first: the screen keeps this client, so it must not be one that stopped answering.
     */
    public static void openWhenConnected(Function<AgentOfficeClient, Screen> screen) {
        if (opening) return;
        opening = true;
        Minecraft mc = Minecraft.getInstance();
        CONNECTION.recheck().whenComplete((c, err) -> mc.execute(() -> {
            opening = false;
            if (err != null) {
                mc.gui.setOverlayMessage(Component.literal("Agent Office isn't running"), false);
            } else if (mc.screen == null && mc.level != null) {
                Screen next = screen.apply(c);
                if (next != null) mc.setScreen(next);
            }
        }));
    }

    /** {@code then}, on the main thread, after {@code millis}, if {@code alive} still holds. */
    public static void later(long millis, BooleanSupplier alive, Runnable then) {
        CompletableFuture.delayedExecutor(millis, TimeUnit.MILLISECONDS, IO).execute(() -> main().execute(() -> {
            if (alive.getAsBoolean()) then.run();
        }));
    }

    /** A lectern's pull requests; "All projects" reads every project at once on these threads. Blocking. */
    public static Review.Gathered reviews(AgentOfficeClient client, LecternStore.Binding binding) throws IOException {
        Review.Gathered gathered = Review.gather(client, binding, IO);
        if (gathered.error() != null) failed(client, gathered.error());
        return gathered;
    }

    public static Executor main() {
        return Minecraft.getInstance()::execute;
    }

    private static AgentOfficeClient connected() {
        return client().join();
    }
}
