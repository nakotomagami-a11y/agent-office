package dev.agentoffice.mc.client.service;

import dev.agentoffice.mc.ModPaths;
import dev.agentoffice.mc.client.ClientSetup;
import dev.agentoffice.mc.client.DevHooks;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Discovery;
import dev.agentoffice.mc.core.Ids;
import java.io.IOException;
import java.net.URI;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Network work never runs on the render thread; results hop back via Minecraft#execute. */
public final class Connection {
    public static final ExecutorService IO = Executors.newCachedThreadPool(Ids.daemon("io"));

    private static volatile AgentOfficeClient client;

    private Connection() {}

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
}
