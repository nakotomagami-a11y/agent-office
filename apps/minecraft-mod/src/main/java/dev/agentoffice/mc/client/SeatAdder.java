package dev.agentoffice.mc.client;

import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import java.io.IOException;
import java.net.ConnectException;
import java.net.http.HttpConnectTimeoutException;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * Adding a seat for an agent in a project (POST roster), shared by the egg's setup and the tablet's roster
 * picker. Adding can make a git worktree, so it is slow and may time out while the server is still
 * making the seat: then the seat that appears (within two minutes) is used, rather than a second one made.
 */
final class SeatAdder {
    interface Done {
        void seat(Api.Slot slot);
    }

    interface Failed {
        void message(String message);
    }

    private static final int APPEAR_POLL_MS = 5_000;
    private static final int APPEAR_WAIT_MS = 120_000;

    private SeatAdder() {}

    /** Callbacks run on the main thread. {@code owner} is shown again after the over-the-cap question. */
    static void add(Screen owner, AgentOfficeClient client, Api.Project project, String agentId, Done done, Failed failed) {
        add(owner, client, project, agentId, false, done, failed);
    }

    private static void add(Screen owner, AgentOfficeClient client, Api.Project project, String agentId, boolean force,
                            Done done, Failed failed) {
        Minecraft mc = Minecraft.getInstance();
        Connection.IO.execute(() -> {
            Set<String> before;
            try {
                before = seatIds(client, project, agentId);
            } catch (IOException | RuntimeException e) {
                mc.execute(() -> failed.message("Couldn't read " + project.name() + ": " + e.getMessage()));
                return;
            }
            try {
                String instanceId = client.addInstance(project.id(), agentId, force);
                Api.Slot slot = new Api.Slot(project.id(), project.name(), agentId, instanceId, null);
                mc.execute(() -> done.seat(slot));
            } catch (Api.ApiException e) {
                mc.execute(() -> {
                    // Only the soft cap can be overridden; at the hard cap the server always says no.
                    if ("INSTANCE_CAP_EXCEEDED".equals(e.code) && e.softCap && !force && mc.screen == owner) {
                        mc.setScreen(new ConfirmScreen(yes -> {
                            mc.setScreen(owner);
                            if (yes) add(owner, client, project, agentId, true, done, failed);
                            else failed.message("Not added.");
                        }, Component.literal(project.name() + " already has a lot of agents"),
                                Component.literal("Agent Office suggests keeping fewer seats per project. Add " + agentId + " anyway?"),
                                Component.literal("Add anyway"), Component.literal("Cancel")));
                    } else if ("INSTANCE_CAP_EXCEEDED".equals(e.code) && e.softCap && !force) {
                        failed.message(project.name() + " already has a lot of agents. Not added.");
                    } else {
                        failed.message("INSTANCE_CAP_EXCEEDED".equals(e.code)
                                ? project.name() + " has as many agents as Agent Office allows. Remove one first."
                                : "Couldn't add the seat: " + e.getMessage());
                    }
                });
            } catch (IOException | RuntimeException e) {
                // The server makes the worktree first and lists the seat after, so a timeout can come well
                // before the seat appears: wait for it rather than let a retry make a second one.
                boolean neverSent = e instanceof ConnectException || e instanceof HttpConnectTimeoutException;
                List<Api.Slot> appeared = List.of();
                for (int waited = 0; !neverSent && appeared.isEmpty() && waited < APPEAR_WAIT_MS; waited += APPEAR_POLL_MS) {
                    try {
                        Thread.sleep(APPEAR_POLL_MS);
                        appeared = seats(client, project, agentId).stream().filter(s -> !before.contains(s.instanceId())).toList();
                    } catch (InterruptedException stop) {
                        Thread.currentThread().interrupt();
                        break;
                    } catch (IOException | RuntimeException again) {
                        // keep waiting: the app may be busy making the worktree
                    }
                }
                List<Api.Slot> found = appeared;
                mc.execute(() -> {
                    if (found.size() == 1) done.seat(found.get(0));
                    else failed.message("Couldn't add the seat: " + e.getMessage());
                });
            }
        });
    }

    static List<Api.Slot> seats(AgentOfficeClient client, Api.Project project, String agentId) throws IOException {
        return client.roster(project).stream().filter(s -> agentId.equals(s.agentId())).toList();
    }

    private static Set<String> seatIds(AgentOfficeClient client, Api.Project project, String agentId) throws IOException {
        return seats(client, project, agentId).stream().map(Api.Slot::instanceId).collect(Collectors.toSet());
    }
}
