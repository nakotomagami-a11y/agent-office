package dev.agentoffice.mc.client.service;

import dev.agentoffice.mc.core.AgentNames;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.Async;
import dev.agentoffice.mc.core.Protocol;
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
 * Adding a seat for an agent in a project (POST roster): the only way the mod adds one. Adding can make a git
 * worktree, so it is slow and may time out while the server is still making the seat: then the seat that appears
 * (within two minutes) is used, rather than a second one made.
 */
public final class SeatAdder {
    public interface Done {
        void seat(Api.Slot slot);
    }

    public interface Failed {
        void message(String message);
    }

    private static final int APPEAR_POLL_MS = 5_000;
    private static final int APPEAR_WAIT_MS = 120_000;

    /** What came of one try: the seat, or the server's refusal, or why it isn't known (null slot and refusal). */
    private record Outcome(Api.Slot slot, Api.ApiException refused, String error) {}

    private SeatAdder() {}

    /** Callbacks run on the main thread, whatever is shown then. {@code owner} is shown again after the over-the-cap question. */
    public static void add(Screen owner, AgentOfficeClient client, Api.Project project, String agentId, Done done, Failed failed) {
        add(owner, client, project, agentId, false, done, failed);
    }

    private static void add(Screen owner, AgentOfficeClient client, Api.Project project, String agentId, boolean force,
                            Done done, Failed failed) {
        AgentOffice.call(client, () -> true, c -> attempt(c, project, agentId, force), outcome -> {
            if (outcome.slot() != null) done.seat(outcome.slot());
            else if (outcome.refused() != null) refused(owner, client, project, agentId, force, outcome.refused(), done, failed);
            else failed.message("Couldn't add the seat: " + outcome.error());
        }, e -> failed.message("Couldn't read " + project.name() + ": " + Async.message(e)));
    }

    /** Off the main thread: a failure to read the roster first throws; everything after is an {@link Outcome}. */
    private static Outcome attempt(AgentOfficeClient client, Api.Project project, String agentId, boolean force) throws IOException {
        Set<String> before = seats(client, project, agentId).stream().map(Api.Slot::instanceId).collect(Collectors.toSet());
        try {
            String instanceId = client.addInstance(project.id(), agentId, force);
            return new Outcome(new Api.Slot(project.id(), project.name(), agentId, instanceId, null), null, null);
        } catch (Api.ApiException e) {
            return new Outcome(null, e, null);
        } catch (IOException | RuntimeException e) {
            // The server makes the worktree first and lists the seat after, so a timeout can come well before the
            // seat appears: wait for it rather than let a retry make a second one.
            boolean neverSent = e instanceof ConnectException || e instanceof HttpConnectTimeoutException;
            for (int waited = 0; !neverSent && waited < APPEAR_WAIT_MS; waited += APPEAR_POLL_MS) {
                try {
                    Thread.sleep(APPEAR_POLL_MS);
                    List<Api.Slot> appeared = seats(client, project, agentId).stream().filter(s -> !before.contains(s.instanceId())).toList();
                    if (appeared.size() == 1) return new Outcome(appeared.get(0), null, null);
                    if (!appeared.isEmpty()) break;
                } catch (InterruptedException stop) {
                    Thread.currentThread().interrupt();
                    break;
                } catch (IOException | RuntimeException again) {
                    // keep waiting: the app may be busy making the worktree
                }
            }
            return new Outcome(null, null, Async.message(e));
        }
    }

    private static void refused(Screen owner, AgentOfficeClient client, Api.Project project, String agentId, boolean force,
                                Api.ApiException e, Done done, Failed failed) {
        Minecraft mc = Minecraft.getInstance();
        boolean cap = Protocol.ApiError.INSTANCE_CAP_EXCEEDED.equals(e.code);
        // Only the soft cap can be overridden; at the hard cap the server always says no.
        if (cap && e.softCap && !force && mc.screen == owner) {
            mc.setScreen(new ConfirmScreen(yes -> {
                mc.setScreen(owner);
                if (yes) add(owner, client, project, agentId, true, done, failed);
                else failed.message("Not added.");
            }, Component.literal(project.name() + " already has a lot of agents"),
                    Component.literal("Agent Office suggests keeping fewer seats per project. Add " + AgentNames.of(agentId) + " anyway?"),
                    Component.literal("Add anyway"), Component.literal("Cancel")));
        } else if (cap && e.softCap && !force) {
            failed.message(project.name() + " already has a lot of agents. Not added.");
        } else {
            failed.message(cap ? project.name() + " has as many agents as Agent Office allows. Remove one first."
                    : "Couldn't add the seat: " + e.getMessage());
        }
    }

    public static List<Api.Slot> seats(AgentOfficeClient client, Api.Project project, String agentId) throws IOException {
        return client.roster(project).stream().filter(s -> agentId.equals(s.agentId())).toList();
    }
}
