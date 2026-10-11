package dev.agentoffice.mc.client.service;

import dev.agentoffice.mc.Tuning;
import dev.agentoffice.mc.client.DevHooks;
import dev.agentoffice.mc.core.AgentState;
import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.Ids;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * How every agent someone is looking at is doing, asked of Agent Office by one loop for the whole client. Screens and
 * the world's bodies say which agents they watch; each is asked once a round however many watch it. (Asking is not
 * free: the server reconciles a conversation before answering.) A state is kept only while someone watches it, so
 * nothing shows an answer from before they looked. Main thread only.
 */
public final class AgentStatus {
    private static final Map<Object, Set<String>> watched = new HashMap<>();
    /** One seat per key, however many records of it the watchers hold (a body's has its names cut). */
    private static final Map<String, Api.Slot> slots = new HashMap<>();
    private static final Map<String, AgentState> states = new HashMap<>();
    private static final List<Runnable> listeners = new ArrayList<>();
    private static boolean polling;
    /** Something newly watched: ask at the next tick rather than at the end of the round. */
    private static boolean soon;
    private static int ticks;

    private AgentStatus() {}

    /** What {@code owner} watches from now on, in place of what it watched before; empty stops it. */
    public static void watch(Object owner, Collection<Api.Slot> watch) {
        Set<String> now = new HashSet<>();
        for (Api.Slot s : watch) {
            now.add(key(s));
            slots.putIfAbsent(key(s), s);
        }
        Set<String> before = watched.getOrDefault(owner, Set.of());
        if (now.isEmpty()) watched.remove(owner);
        else watched.put(owner, now);
        prune();
        if (now.stream().anyMatch(k -> !before.contains(k) && !states.containsKey(k))) soon = true;
    }

    public static void unwatch(Object owner) {
        watched.remove(owner);
        prune();
    }

    /** True while {@code owner} watches {@code slot}. */
    public static boolean watches(Object owner, Api.Slot slot) {
        return watched.getOrDefault(owner, Set.of()).contains(key(slot));
    }

    /** The latest answer for {@code slot}; null until it has been asked since someone started watching it. */
    public static AgentState of(Api.Slot slot) {
        return states.get(key(slot));
    }

    /** Called after each round, on the main thread. */
    public static void onUpdate(Runnable listener) {
        listeners.add(listener);
    }

    public static void tick() {
        if (++ticks % Tuning.STATUS_REPORT_TICKS == 0 || soon) poll();
    }

    /** Nobody watches it any more: forget it, so a later look starts from "not known yet". */
    private static void prune() {
        Set<String> live = new HashSet<>();
        watched.values().forEach(live::addAll);
        states.keySet().retainAll(live);
        slots.keySet().retainAll(live);
    }

    private static void poll() {
        if (polling || watched.isEmpty()) return;
        soon = false;
        Map<String, Api.Slot> round = new LinkedHashMap<>(slots);
        if (DevHooks.working()) {
            round.keySet().forEach(k -> states.put(k, AgentState.WORKING));
            listeners.forEach(Runnable::run);
            return;
        }
        polling = true;
        AgentOffice.call(() -> true, c -> {
            Map<String, AgentState> found = new HashMap<>();
            round.forEach((k, s) -> {
                try {
                    found.put(k, c.current(s).map(conv -> AgentState.of(conv.status())).orElse(AgentState.IDLE));
                } catch (Api.ApiException e) {
                    found.put(k, AgentState.UNKNOWN);
                } catch (IOException e) {
                    found.put(k, AgentState.OFFLINE);
                } catch (RuntimeException e) {
                    Ids.LOG.warn("Couldn't read {}'s status", k, e);
                    found.put(k, AgentState.UNKNOWN);
                }
            });
            return found;
        }, found -> {
            polling = false;
            found.forEach(AgentStatus::store);
            listeners.forEach(Runnable::run);
        }, e -> {
            polling = false;
            round.keySet().forEach(k -> store(k, AgentState.OFFLINE));
            listeners.forEach(Runnable::run);
        });
    }

    /** An answer counts only if someone still watches that seat: one that stopped meanwhile stays unknown. */
    private static void store(String key, AgentState state) {
        if (slots.containsKey(key)) states.put(key, state);
    }

    private static String key(Api.Slot slot) {
        return slot.projectId() + "\n" + slot.instanceId();
    }
}
