package dev.agentoffice.mc.core;

import com.google.gson.JsonObject;
import java.io.Closeable;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.function.Consumer;

/**
 * One agent seat's conversation as the tablet's chat runs it, without the screen. The server owns the conversation
 * (docs/chat-refactor.md): this reads it, follows the active run's stream, re-reads it when a run ends, and sends
 * what the player does. Results land on the host's main thread, and none once {@link #close}d: a late reply must
 * not reopen a stream for a chat the player already left. A run that just ended is never followed again straight
 * away: when another Agent Office process owns it, its stream ends at once, and re-following would spin.
 */
public final class ChatSession {
    static final int MIN_BACKOFF_MS = 1_000;
    static final int MAX_BACKOFF_MS = 30_000;
    static final int FAILURES_BEFORE_REDISCOVERY = 3;
    static final int PERMISSION_POLL_TICKS = 100;
    /** Clicks on the model/effort pickers settle for this long before one PATCH goes out. */
    static final int SEAT_PATCH_DELAY_TICKS = 12;

    /** Where the session's work runs and its results land. */
    public interface Host {
        Executor io();

        /** The thread the chat lives on; every listener call and state change happens there. */
        Executor main();

        /** Seat reads and writes, one at a time and in order, shared by every chat. */
        Executor seats();

        /** {@code then} on the main thread after {@code millis}. */
        void later(long millis, Runnable then);

        /** A fresh connection: Agent Office picks a new port on every launch. */
        CompletableFuture<AgentOfficeClient> reconnect();
    }

    /** What the chat shows, told as it changes; always on the main thread. */
    public interface Listener {
        void items(List<Transcript.Item> items);

        /** Anything the layout reads changed: status, seat, attachments, approvals, busy. */
        void changed();

        void flash(String message);

        /** A send failed: this text goes back in the composer, unless the player typed something new. */
        void unsent(String text);
    }

    /** An image attached to the next message: its name, and where Agent Office saved it (null while uploading). */
    public record Attached(String name, String path) {}

    public record Upload(String filename, String contentType, byte[] data) {}

    public interface Clipboard {
        Optional<Upload> read(AgentOfficeClient client) throws IOException;
    }

    private final Host host;
    private final Api.Slot slot;
    private final Listener listener;
    private AgentOfficeClient client;

    private Api.Conversation conversation;
    private List<Transcript.Item> history = List.of();
    private Transcript.Live live;
    private List<Api.Permission> pending = List.of();
    private final Set<String> answering = new HashSet<>();
    private Api.Instance seat;
    private Api.Agent agent;
    private final JsonObject unsentSeat = new JsonObject();
    private final List<Attached> attachments = new ArrayList<>();
    private boolean pasting;
    private int seatPatchIn;
    private Closeable stream;
    private String streamingRunId;
    /** A run whose stream reported its end (done/error); following it again would only spin. */
    private String endedRunId;
    /** Set by a done/error event on the current stream; a stream that just drops did not end the run. */
    private boolean streamSawEnd;
    private String lastFollowedRunId;
    private int backoffMs = MIN_BACKOFF_MS;
    private int failures;
    private boolean refreshPending;
    private boolean started;
    private boolean closed;
    private boolean busy;
    private String status = "Loading…";
    private int ticks;

    public ChatSession(Host host, AgentOfficeClient client, Api.Slot slot, Listener listener) {
        this.host = host;
        this.client = client;
        this.slot = slot;
        this.listener = listener;
    }

    // ── what the chat shows ─────────────────────────────────────────────────

    public Api.Slot slot() {
        return slot;
    }

    /** Replaced when Agent Office comes back on another port. */
    public AgentOfficeClient client() {
        return client;
    }

    /** Null until the first read. */
    public Api.Conversation conversation() {
        return conversation;
    }

    public String status() {
        return status;
    }

    public boolean busy() {
        return busy;
    }

    public List<Api.Permission> pending() {
        return pending;
    }

    public boolean answering(String permissionId) {
        return answering.contains(permissionId);
    }

    /** Null until read; shows a picker click not sent yet. */
    public Api.Instance seat() {
        return seat;
    }

    public Api.Agent agent() {
        return agent;
    }

    public List<Attached> attachments() {
        return List.copyOf(attachments);
    }

    // ── lifecycle ───────────────────────────────────────────────────────────

    /** The first time the chat is shown: reads the conversation and the seat. Later calls do nothing. */
    public void start() {
        if (started) return;
        started = true;
        refresh();
        loadSeat();
    }

    /** The chat went away (or something opened on top of it): no more results, the stream closes, a pending seat change goes out. */
    public void close() {
        closed = true;
        closeStream();
        seatPatchIn = 0;
        sendSeatPatch(false);
    }

    /** Back after {@link #close}: whatever was in flight then was dropped, so it starts over. */
    public void reopen() {
        if (!closed) return;
        closed = false;
        started = false;
        busy = false;
        answering.clear();
        refreshPending = false;
        pasting = false;
        attachments.removeIf(a -> a.path() == null);
    }

    public void tick() {
        ticks++;
        if (seatPatchIn > 0 && --seatPatchIn == 0) sendSeatPatch(true);
        if (ticks % PERMISSION_POLL_TICKS == 0) loadPermissions();
    }

    // ── reading ─────────────────────────────────────────────────────────────

    private void refresh() {
        if (closed) return;
        io(c -> c.open(slot), conv -> {
            failures = 0;
            show(conv);
        }, e -> {
            status = "Could not load: " + Async.message(e);
            if (++failures >= FAILURES_BEFORE_REDISCOVERY) rediscover();
            else refreshLater();
        });
    }

    private void rediscover() {
        failures = 0;
        host.reconnect().whenComplete((found, err) -> onMain(() -> {
            if (found != null) client = found;
            refreshLater();
        }));
    }

    private void refreshLater() {
        if (closed || refreshPending) return;
        refreshPending = true;
        int delay = backoffMs;
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        host.later(delay, () -> {
            if (closed) return;
            refreshPending = false;
            refresh();
        });
    }

    private record SeatRead(Api.Instance seat, Api.Agent agent) {}

    /** The seat's own model/effort and the agent's defaults; behind any PATCH already queued, so it reads what that wrote. */
    private void loadSeat() {
        AgentOfficeClient c = client;
        Async.run(host.seats(), host.main(), () -> !closed, () -> {
            Api.Instance found = null;
            for (Api.Instance i : c.instances(new Api.Project(slot.projectId(), slot.projectName(), 0))) {
                if (i.slot().instanceId().equals(slot.instanceId())) found = i;
            }
            Api.Agent def = null;
            for (Api.Agent a : c.agents()) {
                if (a.id().equals(slot.agentId())) def = a;
            }
            return new SeatRead(found, def);
        }, read -> {
            Api.Instance shown = read.seat();
            // A click not sent yet is newer than what the server had: keep showing it.
            if (shown != null && unsentSeat.has("model")) {
                shown = new Api.Instance(shown.slot(), unsentSeat.get("model").getAsString(), shown.effort(), shown.permissionMode());
            }
            if (shown != null && unsentSeat.has("effort")) {
                shown = new Api.Instance(shown.slot(), shown.model(), unsentSeat.get("effort").getAsString(), shown.permissionMode());
            }
            seat = shown;
            agent = read.agent();
            listener.changed();
        }, e -> listener.flash("Couldn't read this seat's settings: " + Async.message(e)));
    }

    /** Rebuilds the thread from the server's view and follows the active run, if any. */
    private void show(Api.Conversation c) {
        boolean statusChanged = conversation == null || !Objects.equals(c.status(), conversation.status())
                || c.running() != conversation.running() || !Objects.equals(c.id(), conversation.id());
        conversation = c;
        history = Transcript.history(c);
        boolean sameLiveRun = c.running() && c.activeRunId().equals(streamingRunId);
        if (!sameLiveRun) live = null;
        status = statusText(c);

        if (!c.running()) {
            backoffMs = MIN_BACKOFF_MS;
        } else if (sameLiveRun) {
            // Already following it.
        } else if (c.activeRunId().equals(endedRunId)) {
            status = "Working… (waiting for this run to finish)";
            refreshLater();
        } else {
            // Re-attaching after a dropped stream keeps the backoff; a new run starts fresh.
            if (!c.activeRunId().equals(lastFollowedRunId)) backoffMs = MIN_BACKOFF_MS;
            follow(c.activeRunId());
        }
        pushItems();
        loadPermissions();
        if (statusChanged) listener.changed();
    }

    private void pushItems() {
        List<Transcript.Item> items = new ArrayList<>(history);
        if (live != null) items.addAll(live.items());
        if (conversation != null && conversation.queued() > 0) {
            items.add(new Transcript.Note(conversation.queued() + " message(s) queued — they run after this one.", false));
        }
        listener.items(items);
    }

    private void follow(String runId) {
        closeStream();
        streamingRunId = runId;
        lastFollowedRunId = runId;
        streamSawEnd = false;
        live = new Transcript.Live();
        stream = client.stream(runId, host.io(), event -> onMain(() -> onEvent(runId, event)), err -> onMain(() -> {
            if (!runId.equals(streamingRunId)) return;
            streamingRunId = null;
            stream = null;
            // Only a real end marks the run; after a drop, the refresh re-attaches and the server
            // replays the whole run ("attached" + event log).
            endedRunId = streamSawEnd ? runId : null;
            if (err != null) listener.flash("Lost the live stream: " + Async.message(err));
            refreshLater();
        }));
    }

    private void onEvent(String runId, Api.Event event) {
        if (!runId.equals(streamingRunId) || live == null) return;
        if (!live.apply(event)) {
            if (Protocol.Event.PERMISSION_REQUEST.equals(event.name())) loadPermissions();
            return;
        }
        switch (event.name()) {
            case Protocol.Event.DONE, Protocol.Event.ERROR -> streamSawEnd = true;
            case Protocol.Event.ATTACHED -> loadPermissions(); // requests aren't replayed: read what's parked now
            default -> { }
        }
        String tool = live.runningTool();
        if (conversation != null && conversation.running()) status = tool != null ? "Working: " + tool : "Working…";
        pushItems();
    }

    private void loadPermissions() {
        if (conversation == null || !conversation.running()) {
            if (!pending.isEmpty()) {
                pending = List.of();
                answering.clear();
                listener.changed();
            }
            return;
        }
        String runId = conversation.activeRunId();
        io(c -> c.permissions(runId), found -> {
            if (!found.equals(pending)) {
                pending = found;
                answering.removeIf(id -> found.stream().noneMatch(p -> p.id().equals(id)));
                listener.changed();
            }
        }, e -> {
            // The run may have just ended; the next poll or refresh settles it.
        });
    }

    // ── what the player does ────────────────────────────────────────────────

    /**
     * Sends the typed text with the attached images' paths; false when there is nothing to send yet (no
     * conversation, an image still uploading, nothing typed or attached), and the composer keeps its text.
     */
    public boolean send(String typed) {
        if (conversation == null) return false;
        if (pasting || attachments.stream().anyMatch(a -> a.path() == null)) {
            listener.flash("Still uploading the image…");
            return false;
        }
        List<Attached> sending = List.copyOf(attachments);
        String text = Attachments.compose(typed, sending.stream().map(Attached::path).toList());
        if (text == null) return false;
        attachments.clear();
        listener.changed();
        String id = conversation.id();
        io(c -> c.send(id, text), this::show, e -> {
            listener.flash("Not sent: " + Async.message(e));
            listener.unsent(typed.trim());
            attachments.addAll(0, sending);
            listener.changed();
        });
        return true;
    }

    /** An image off the clipboard, uploaded to the project and attached to the next message, as in the web app. */
    public void paste(Clipboard clipboard) {
        if (pasting) return;
        pasting = true;
        listener.flash("Reading the clipboard…");
        io(clipboard::read, clip -> {
            if (clip.isEmpty()) {
                pasting = false;
                listener.flash("Nothing to paste: no text or image on the clipboard.");
                return;
            }
            Upload u = clip.get();
            Attached uploading = new Attached(u.filename(), null);
            attachments.add(uploading);
            listener.changed();
            io(cl -> cl.upload(slot.projectId(), u.filename(), u.contentType(), u.data()), path -> {
                pasting = false;
                int i = attachments.indexOf(uploading);
                // The name the server saved it under (it may tidy it), as the web composer shows.
                if (i >= 0) attachments.set(i, new Attached(Path.of(path).getFileName().toString(), path));
                listener.flash("Attached " + u.filename() + ".");
                listener.changed();
            }, e -> {
                pasting = false;
                attachments.remove(uploading);
                listener.flash("Couldn't paste the image: " + Async.message(e));
                listener.changed();
            });
        }, e -> {
            pasting = false;
            listener.flash("Couldn't paste the image: " + Async.message(e));
        });
    }

    public void unattach(List<Attached> these) {
        attachments.removeAll(these);
        listener.changed();
    }

    public void stop() {
        if (busy || conversation == null || !conversation.running()) return;
        String runId = conversation.activeRunId();
        setBusy(true);
        io(c -> c.abort(runId), aborted -> {
            setBusy(false);
            listener.flash(aborted ? "Stopped." : "That run had already finished.");
            refresh();
        }, e -> {
            setBusy(false);
            listener.flash("Couldn't stop: " + Async.message(e));
        });
    }

    /** Retry, resume or skip after needs_attention, or a new thread. */
    public void act(Protocol.Action action) {
        if (busy || conversation == null) return;
        String id = conversation.id();
        setBusy(true);
        io(c -> c.act(id, action), conv -> {
            busy = false;
            if (action == Protocol.Action.NEW) {
                closeStream();
                live = null;
            }
            show(conv);
            listener.changed();
        }, e -> {
            setBusy(false);
            listener.flash("Couldn't " + action.label().toLowerCase(Locale.ROOT) + ": " + Async.message(e));
        });
    }

    public void answer(Api.Permission p, boolean allow) {
        if (!answering.add(p.id())) return;
        listener.changed();
        io(c -> {
            c.answerPermission(p.runId(), p.id(), allow);
            return null;
        }, done -> loadPermissions(), e -> {
            answering.remove(p.id());
            listener.flash("Couldn't answer: " + Async.message(e));
            loadPermissions();
            listener.changed();
        });
    }

    /**
     * A picker click changes the shown value at once and sends one PATCH once the clicks settle, with the final
     * value: cycling never fires a PATCH per intermediate value, and a re-read never shows a stale one.
     */
    public void changeSeat(String field, String value) {
        if (seat == null) return;
        seat = "model".equals(field)
                ? new Api.Instance(seat.slot(), value, seat.effort(), seat.permissionMode())
                : new Api.Instance(seat.slot(), seat.model(), value, seat.permissionMode());
        unsentSeat.addProperty(field, value);
        seatPatchIn = SEAT_PATCH_DELAY_TICKS;
    }

    private void sendSeatPatch(boolean report) {
        if (unsentSeat.size() == 0) return;
        JsonObject patch = unsentSeat.deepCopy();
        for (String key : patch.keySet()) unsentSeat.remove(key);
        AgentOfficeClient c = client;
        Async.run(host.seats(), host.main(), () -> report && !closed, () -> {
            c.patchInstance(slot, patch);
            return null;
        }, done -> {
            List<String> changes = new ArrayList<>();
            for (String key : patch.keySet()) {
                String v = patch.get(key).getAsString();
                changes.add(Character.toUpperCase(key.charAt(0)) + key.substring(1) + " → " + (v.isEmpty() ? "agent default" : v));
            }
            listener.flash(String.join(", ", changes) + " (from the next message, for this seat)");
        }, e -> {
            listener.flash("Couldn't change " + String.join("/", patch.keySet()) + ": " + Async.message(e));
            loadSeat(); // show what the server really has
        });
    }

    // ── plumbing ────────────────────────────────────────────────────────────

    private void setBusy(boolean b) {
        busy = b;
        listener.changed();
    }

    private void closeStream() {
        streamingRunId = null;
        if (stream == null) return;
        try {
            stream.close();
        } catch (IOException ignored) {
            // Already closed by the server; nothing left to release.
        }
        stream = null;
    }

    private interface Call<T> {
        T run(AgentOfficeClient client) throws IOException;
    }

    /** {@code work} with the client of now, read here on the main thread, run on the IO threads. */
    private <T> void io(Call<T> work, Consumer<T> ok, Consumer<Exception> failed) {
        AgentOfficeClient c = client;
        Async.run(host.io(), host.main(), () -> !closed, () -> work.run(c), ok, failed);
    }

    /** On the main thread, and not at all once closed. */
    private void onMain(Runnable r) {
        host.main().execute(() -> {
            if (!closed) r.run();
        });
    }

    static String statusText(Api.Conversation c) {
        String base = switch (c.status() == null ? "" : c.status()) {
            case Protocol.Conversation.RUNNING -> "Working…";
            case Protocol.Conversation.NEEDS_ATTENTION -> "Needs attention";
            default -> "Idle";
        };
        return c.queued() > 0 ? base + "  ·  " + c.queued() + " queued" : base;
    }
}
