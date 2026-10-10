package dev.agentoffice.mc.client;

import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Discovery;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Network work never runs on the render thread; results hop back via Minecraft#execute. */
public final class Connection {
    public static final ExecutorService IO = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "agentoffice-io");
        t.setDaemon(true);
        return t;
    });

    private static volatile AgentOfficeClient client;

    private Connection() {}

    /** Reuses a healthy client; otherwise rediscovers (the app's port changes on every launch). */
    public static CompletableFuture<AgentOfficeClient> client() {
        return CompletableFuture.supplyAsync(() -> {
            AgentOfficeClient current = client;
            if (current != null && current.healthy()) return current;
            List<URI> candidates = Discovery.candidates(ClientSetup.BASE_URL.get(), Path.of(System.getProperty("user.home")));
            if (candidates.isEmpty()) {
                throw new IllegalStateException(new IOException("baseUrl must be this machine, e.g. http://127.0.0.1:3000"));
            }
            // A local: two rediscoveries can race, and the field may be reset by the other one.
            AgentOfficeClient found = AgentOfficeClient.connect(candidates).orElse(null);
            if (found == null) throw new IllegalStateException(new IOException("not_running: tried " + candidates));
            // A scripted dev check must never send, stop or edit anything, whatever input reaches its window.
            if (DevHooks.active()) found.readOnly();
            client = found;
            return found;
        }, IO);
    }
}
