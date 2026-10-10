package dev.agentoffice.mc.client;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.agentoffice.mc.client.ui.FlatButton;
import dev.agentoffice.mc.client.ui.FlatCycle;
import dev.agentoffice.mc.client.ui.ImageScreen;
import dev.agentoffice.mc.client.ui.TabletScreen;
import dev.agentoffice.mc.client.ui.Theme;
import dev.agentoffice.mc.client.ui.TranscriptView;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.Transcript;
import java.io.Closeable;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.MultiLineEditBox;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.util.FormattedCharSequence;
import org.lwjgl.glfw.GLFW;

/**
 * One agent seat's conversation, on the tablet. The server owns the conversation
 * (docs/chat-refactor.md): this screen renders its turns like the web chat does, follows the active
 * run's stream, and re-reads the conversation when a run ends.
 *
 * Every async result checks {@code closed}: a late reply must not reopen a stream for a screen the
 * player already left. A run that just ended is never followed again straight away — when another
 * Agent Office process owns it, its stream ends at once, and re-following would spin.
 */
public final class ChatScreen extends WorkspaceScreen {
    private static final int MIN_BACKOFF_MS = 1_000;
    private static final int MAX_BACKOFF_MS = 30_000;
    private static final int HEADER = 24;
    /** The composer starts at one line and grows with the text up to this many. */
    private static final int COMPOSER_LINES = 5;
    private static final int ATTENTION_BAR = 22;
    /** Header pickers drop their captions ("Model: ") before the title gets narrower than this. */
    private static final int MIN_TITLE = 120;
    /** Header text on the grey window: vanilla's title colour, then quieter and status shades that read on it. */
    private static final int PANEL_MUTED = 0x555555;
    private static final int PANEL_WORKING = 0x3F33A8;
    private static final int PANEL_ATTENTION = 0x6E4700;
    private static final int PERMISSION_POLL_TICKS = 100;
    private static final int PERMISSION_LINES = 4;
    /** Approval cards never squeeze the transcript below this. */
    private static final int MIN_TRANSCRIPT = 60;
    private static final int TOOLTIP_LINES = 40;
    /** Clicks on the model/effort pickers settle for this long before one PATCH goes out. */
    private static final int SEAT_PATCH_DELAY_TICKS = 12;
    private static final int FAILURES_BEFORE_REDISCOVERY = 3;

    private final Screen parent;
    private final Api.Slot slot;
    private final TranscriptView view;
    /** Replaced when Agent Office restarts on another port (see {@link #rediscover}). */
    private AgentOfficeClient client;
    private MultiLineEditBox input;
    private int shownLines = 1;
    private Api.Conversation conversation;
    private List<Transcript.Item> history = List.of();
    private Transcript.Live live;
    private List<Api.Permission> pending = List.of();
    private final Set<String> answering = new HashSet<>();
    private Api.Instance seat;
    private Api.Agent agent;
    private final JsonObject unsentSeat = new JsonObject();
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
    private String status = "Loading…";
    private String flash;
    private int flashTicks;
    private int ticks;
    private boolean busy;

    // Layout from init(), read by the render methods.
    private int headerRight;
    private int areaTop;
    private int areaBottom;
    private int attentionY = -1;
    private final List<PermissionCard> cards = new ArrayList<>();
    private int hiddenApprovals;

    private record PermissionCard(Api.Permission permission, List<FormattedCharSequence> lines, List<FormattedCharSequence> full, int y, int h) {}

    public ChatScreen(Screen parent, AgentOfficeClient client, Api.Slot slot) {
        super(Component.literal(slot.displayName()));
        this.parent = parent;
        this.client = client;
        this.slot = slot;
        this.view = new TranscriptView(Minecraft.getInstance().font, () -> this.client, slot.displayName(),
                img -> Minecraft.getInstance().setScreen(new ImageScreen(this, img)));
    }

    @Override
    protected String projectId() {
        return slot.projectId();
    }

    @Override
    protected Api.Slot activeSlot() {
        return slot;
    }

    @Override
    protected void init() {
        super.init();
        int x0 = left;
        int x1 = right;
        int wx0 = left + 5;
        int wx1 = right - 5;

        // Header, right to left: Dismiss (when a body is placed), New, then the effort and model pickers.
        int hy = top;
        int hx = x1;
        if (Bodies.placed(Minecraft.getInstance(), slot)) {
            int w = buttonWidth("Dismiss");
            hx -= w;
            // Removes only the body in this world; the agent and its chat stay in Agent Office.
            addRenderableWidget(new FlatButton(hx, hy, w, 20, "Dismiss", FlatButton.Kind.NORMAL, b -> {
                Bodies.dismiss(Minecraft.getInstance(), slot);
                onClose();
            }));
            hx -= 4;
        }
        int newW = buttonWidth("New");
        hx -= newW;
        addRenderableWidget(new FlatButton(hx, hy, newW, 20, "New", FlatButton.Kind.NORMAL, b -> act("new")))
                .active = conversation != null && !busy;
        if (seat != null) {
            // Labelled like vanilla's options ("Model: opus"); unset shows the agent's default.
            String modelDef = def(agent == null ? null : agent.defaultModel());
            String effortDef = def(agent == null ? null : agent.defaultEffort());
            Function<String, String> model = v -> "Model: " + (v.isEmpty() ? modelDef : v);
            Function<String, String> effort = v -> "Effort: " + (v.isEmpty() ? effortDef : v);
            if (titleRoom(hx, cycleWidth(Api.MODELS, seat.model(), model), cycleWidth(Api.EFFORTS, seat.effort(), effort), x0) < MIN_TITLE) {
                model = v -> v.isEmpty() ? modelDef : v;
                effort = v -> v.isEmpty() ? effortDef : v;
            }
            int ew = cycleWidth(Api.EFFORTS, seat.effort(), effort);
            int mw = cycleWidth(Api.MODELS, seat.model(), model);
            if (titleRoom(hx, ew, mw, x0) >= MIN_TITLE / 2) {
                Tooltip hint = Tooltip.create(Component.literal("Click: next · Right-click: previous"));
                hx -= 4 + ew;
                addRenderableWidget(new FlatCycle<>(hx, hy, ew, 20, Api.EFFORTS, nz(seat.effort()), effort)
                        .onChange(v -> changeSeat("effort", v))).setTooltip(hint);
                hx -= 4 + mw;
                addRenderableWidget(new FlatCycle<>(hx, hy, mw, 20, Api.MODELS, nz(seat.model()), model)
                        .onChange(v -> changeSeat("model", v))).setTooltip(hint);
            }
        }
        headerRight = hx;

        // Composer: one line that grows with the text; Send beside it, or Stop + Queue while a run works.
        // The same box across rebuilds keeps the cursor; a new width needs a new box (MultiLineEditBox
        // fixes its wrap width when constructed), so the width is the same running or not, and leaves
        // room for the box's own scrollbar, which it draws outside itself.
        boolean running = conversation != null && conversation.running();
        String sendLabel = running ? "Queue" : "Send";
        int sendW = buttonWidth(sendLabel);
        int stopW = buttonWidth("Stop");
        int composerW = x1 - x0 - buttonWidth("Queue") - 4 - stopW - 4 - 8;
        if (input == null || input.getWidth() != composerW) {
            String text = input == null ? "" : input.getValue();
            input = new MultiLineEditBox(font, x0, 0, composerW, 20,
                    Component.literal("Message " + slot.displayName() + "…  (Enter sends)"), Component.literal("Message"));
            input.setValue(text);
            input.setValueListener(v -> {
                if (composerLines() != shownLines) rebuildWidgets();
            });
        }
        shownLines = composerLines();
        int composerH = 11 + 9 * shownLines;
        int cy = bottom - composerH;
        input.setRectangle(composerW, composerH, x0, cy);
        addRenderableWidget(input);
        int by = bottom - 20;
        addRenderableWidget(new FlatButton(x1 - sendW, by, sendW, 20, sendLabel, FlatButton.Kind.PRIMARY, b -> send()))
                .active = conversation != null;
        if (running) {
            addRenderableWidget(new FlatButton(x1 - sendW - 4 - stopW, by, stopW, 20, "Stop", FlatButton.Kind.DANGER, b -> stop()))
                    .active = !busy;
        }

        // At the bottom of the transcript's well: needs-attention actions, then pending approvals.
        areaBottom = cy - 6;
        int above = areaBottom - 5;
        attentionY = -1;
        if (conversation != null && conversation.needsAttention()) {
            above -= ATTENTION_BAR;
            attentionY = above;
            int bx = wx1 - 3;
            for (String action : new String[] {"skip", "resume", "retry"}) {
                int w = buttonWidth(cap(action));
                bx -= w;
                addRenderableWidget(new FlatButton(bx, above + 3, w, 16, cap(action),
                        "retry".equals(action) ? FlatButton.Kind.PRIMARY : FlatButton.Kind.NORMAL, b -> act(action))).active = !busy;
                bx -= 4;
            }
            above -= 6;
        }
        cards.clear();
        int transcriptTop = top + HEADER;
        // Oldest approvals first, as many as fit while the transcript keeps MIN_TRANSCRIPT; the rest wait.
        List<List<FormattedCharSequence>> cardLines = new ArrayList<>();
        int room = above - transcriptTop - MIN_TRANSCRIPT;
        int shown = 0;
        for (Api.Permission p : pending) {
            List<FormattedCharSequence> detail = font.split(Component.literal(permissionDetail(p)), wx1 - wx0 - 12);
            List<FormattedCharSequence> lines = new ArrayList<>(detail.subList(0, Math.min(PERMISSION_LINES, detail.size())));
            lines.add(Component.literal(detail.size() > PERMISSION_LINES ? "… hover for the full input" : "hover for the full input")
                    .withColor(Theme.TXT_4).getVisualOrderText());
            int h = 22 + lines.size() * 10 + 4;
            if (h > room) break;
            room -= h;
            cardLines.add(lines);
            shown++;
        }
        hiddenApprovals = pending.size() - shown;
        for (int i = shown - 1; i >= 0; i--) {
            Api.Permission p = pending.get(i);
            List<FormattedCharSequence> lines = cardLines.get(i);
            int h = 22 + lines.size() * 10;
            above -= h;
            List<FormattedCharSequence> full = font.split(Component.literal(fullInput(p)), Math.max(120, (wx1 - wx0) / 2));
            if (full.size() > TOOLTIP_LINES) {
                int rest = full.size() - TOOLTIP_LINES;
                full = new ArrayList<>(full.subList(0, TOOLTIP_LINES));
                full.add(Component.literal("… " + rest + " more lines").withColor(Theme.TXT_4).getVisualOrderText());
            }
            cards.add(0, new PermissionCard(p, lines, full, above, h));
            boolean waiting = answering.contains(p.id());
            addRenderableWidget(new FlatButton(wx1 - 103, above + 4, 48, 16, "Deny", FlatButton.Kind.DANGER, b -> answer(p, false))).active = !waiting;
            addRenderableWidget(new FlatButton(wx1 - 51, above + 4, 48, 16, "Allow", FlatButton.Kind.PRIMARY, b -> answer(p, true))).active = !waiting;
            above -= 6;
        }
        // The transcript fills the rest of its well.
        areaTop = transcriptTop;
        view.setBounds(wx0, areaTop + 5, wx1 - wx0, Math.max(0, above - (areaTop + 5)));

        if (!started) {
            started = true;
            refresh();
            loadSeat();
        }
    }

    @Override
    protected GuiEventListener typingTarget() {
        return input;
    }

    /** Every rebuild (a status change, the composer growing) gives the composer its focus back. */
    @Override
    protected void setInitialFocus() {
        if (input != null) setInitialFocus(input);
    }

    private int composerLines() {
        return Math.max(1, Math.min(COMPOSER_LINES, input.getInnerHeight() / 9));
    }

    /** What the header title gets left of the pickers: their gaps, the dot and the title margin. */
    private static int titleRoom(int buttonsLeft, int effortW, int modelW, int x0) {
        return buttonsLeft - 4 - effortW - 4 - modelW - 8 - (x0 + 10);
    }

    private int buttonWidth(String label) {
        return Math.max(40, font.width(label) + 16);
    }

    /** Wide enough for every value, so cycling never resizes the picker. */
    private int cycleWidth(List<String> values, String current, Function<String, String> label) {
        int w = font.width(label.apply(nz(current)));
        for (String v : values) w = Math.max(w, font.width(label.apply(v)));
        return w + 16;
    }

    // ── loading and streaming ───────────────────────────────────────────────

    private void refresh() {
        if (closed) return;
        AgentOfficeClient c = client;
        Connection.IO.execute(() -> {
            try {
                Api.Conversation conv = c.open(slot);
                onMain(() -> {
                    failures = 0;
                    show(conv);
                });
            } catch (IOException e) {
                onMain(() -> {
                    status = "Could not load: " + e.getMessage();
                    if (++failures >= FAILURES_BEFORE_REDISCOVERY) rediscover();
                    else refreshLater();
                });
            }
        });
    }

    /** Agent Office picks a new port on every launch: after repeated failures, find it again. */
    private void rediscover() {
        failures = 0;
        Connection.client().whenComplete((found, err) -> onMain(() -> {
            if (found != null) client = found;
            refreshLater();
        }));
    }

    private void refreshLater() {
        if (closed || refreshPending) return;
        refreshPending = true;
        int delay = backoffMs;
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
        CompletableFuture.delayedExecutor(delay, TimeUnit.MILLISECONDS, Connection.IO).execute(() -> onMain(() -> {
            refreshPending = false;
            refresh();
        }));
    }

    /** The seat's own model/effort and the agent's defaults, for the header pickers. */
    private void loadSeat() {
        AgentOfficeClient c = client;
        // Behind any PATCH already queued, so it reads what that PATCH wrote.
        SEAT_QUEUE.execute(() -> {
            try {
                Api.Instance found = null;
                for (Api.Instance i : c.instances(new Api.Project(slot.projectId(), slot.projectName(), 0))) {
                    if (i.slot().instanceId().equals(slot.instanceId())) found = i;
                }
                Api.Agent def = null;
                for (Api.Agent a : c.agents()) {
                    if (a.name().equals(slot.agentId())) def = a;
                }
                Api.Instance s = found;
                Api.Agent d = def;
                onMain(() -> {
                    // A click not sent yet is newer than what the server had: keep showing it.
                    Api.Instance shown = s;
                    if (shown != null && unsentSeat.has("model")) {
                        shown = new Api.Instance(shown.slot(), unsentSeat.get("model").getAsString(), shown.effort(), shown.permissionMode());
                    }
                    if (shown != null && unsentSeat.has("effort")) {
                        shown = new Api.Instance(shown.slot(), shown.model(), unsentSeat.get("effort").getAsString(), shown.permissionMode());
                    }
                    seat = shown;
                    agent = d;
                    rebuildWidgets();
                });
            } catch (IOException e) {
                onMain(() -> flash("Couldn't read this seat's settings: " + e.getMessage()));
            }
        });
    }

    private void send() {
        String text = input.getValue().trim();
        if (text.isEmpty() || conversation == null) return;
        input.setValue("");
        view.scrollToBottom();
        String id = conversation.id();
        AgentOfficeClient c = client;
        Connection.IO.execute(() -> {
            try {
                Api.Conversation conv = c.send(id, text);
                onMain(() -> show(conv));
            } catch (IOException e) {
                onMain(() -> {
                    flash("Not sent: " + e.getMessage());
                    if (input.getValue().isEmpty()) input.setValue(text);
                });
            }
        });
    }

    private void stop() {
        if (busy || conversation == null || !conversation.running()) return;
        String runId = conversation.activeRunId();
        busy = true;
        rebuildWidgets();
        AgentOfficeClient c = client;
        Connection.IO.execute(() -> {
            try {
                boolean aborted = c.abort(runId);
                onMain(() -> {
                    busy = false;
                    flash(aborted ? "Stopped." : "That run had already finished.");
                    rebuildWidgets();
                    refresh();
                });
            } catch (IOException e) {
                onMain(() -> {
                    busy = false;
                    flash("Couldn't stop: " + e.getMessage());
                    rebuildWidgets();
                });
            }
        });
    }

    /** retry / resume / skip after needs_attention, or new for a fresh thread. */
    private void act(String action) {
        if (busy || conversation == null) return;
        String id = conversation.id();
        busy = true;
        rebuildWidgets();
        AgentOfficeClient c = client;
        Connection.IO.execute(() -> {
            try {
                Api.Conversation conv = c.act(id, action);
                onMain(() -> {
                    busy = false;
                    if ("new".equals(action)) {
                        closeStream();
                        live = null;
                    }
                    show(conv);
                    rebuildWidgets();
                });
            } catch (IOException e) {
                onMain(() -> {
                    busy = false;
                    flash("Couldn't " + action + ": " + e.getMessage());
                    rebuildWidgets();
                });
            }
        });
    }

    /**
     * A picker click changes the shown value at once and sends one PATCH once the clicks settle, with
     * the final value: cycling never fires a PATCH per intermediate value, and rebuilds never show a
     * stale one.
     */
    private void changeSeat(String field, String value) {
        if (seat == null) return;
        seat = "model".equals(field)
                ? new Api.Instance(seat.slot(), value, seat.effort(), seat.permissionMode())
                : new Api.Instance(seat.slot(), seat.model(), value, seat.permissionMode());
        unsentSeat.addProperty(field, value);
        seatPatchIn = SEAT_PATCH_DELAY_TICKS;
    }

    /** Seat reads and writes run one at a time, in order, even across closing and reopening the chat. */
    private static final ExecutorService SEAT_QUEUE = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "agentoffice-seat");
        t.setDaemon(true);
        return t;
    });

    private void sendSeatPatch(boolean report) {
        if (unsentSeat.size() == 0) return;
        JsonObject patch = unsentSeat.deepCopy();
        for (String key : patch.keySet()) unsentSeat.remove(key);
        AgentOfficeClient c = client;
        SEAT_QUEUE.execute(() -> {
            try {
                c.patchInstance(slot, patch);
                if (report) onMain(() -> {
                    List<String> changes = new ArrayList<>();
                    for (String key : patch.keySet()) {
                        String v = patch.get(key).getAsString();
                        changes.add(cap(key) + " → " + (v.isEmpty() ? "agent default" : v));
                    }
                    flash(String.join(", ", changes) + " (from the next message, for this seat)");
                });
            } catch (IOException e) {
                if (report) onMain(() -> {
                    flash("Couldn't change " + String.join("/", patch.keySet()) + ": " + e.getMessage());
                    loadSeat(); // show what the server really has
                });
            }
        });
    }

    private void loadPermissions() {
        if (conversation == null || !conversation.running()) {
            if (!pending.isEmpty()) {
                pending = List.of();
                answering.clear();
                rebuildWidgets();
            }
            return;
        }
        String runId = conversation.activeRunId();
        AgentOfficeClient c = client;
        Connection.IO.execute(() -> {
            try {
                List<Api.Permission> found = c.permissions(runId);
                onMain(() -> {
                    if (!found.equals(pending)) {
                        pending = found;
                        answering.removeIf(id -> found.stream().noneMatch(p -> p.id().equals(id)));
                        rebuildWidgets();
                    }
                });
            } catch (IOException ignored) {
                // The run may have just ended; the next poll or refresh settles it.
            }
        });
    }

    private void answer(Api.Permission p, boolean allow) {
        if (!answering.add(p.id())) return;
        rebuildWidgets();
        AgentOfficeClient c = client;
        Connection.IO.execute(() -> {
            try {
                c.answerPermission(p.runId(), p.id(), allow);
                onMain(this::loadPermissions);
            } catch (IOException e) {
                onMain(() -> {
                    answering.remove(p.id());
                    flash("Couldn't answer: " + e.getMessage());
                    loadPermissions();
                    rebuildWidgets();
                });
            }
        });
    }

    /** Everything the tool would get (a Write's content, an Edit's old/new text), for the hover. */
    private static String fullInput(Api.Permission p) {
        if (p.input() == null) return "(no input)";
        try {
            JsonElement el = JsonParser.parseString(p.input());
            String pretty = new GsonBuilder().setPrettyPrinting().disableHtmlEscaping().create().toJson(el);
            // Escaped newlines inside strings become real ones, so scripts and file content read as such.
            return pretty.replace("\\n", "\n").replace("\\t", "    ");
        } catch (RuntimeException e) {
            return p.input();
        }
    }

    /** A Bash approval shows the command itself; other tools their main field, else the JSON. */
    private static String permissionDetail(Api.Permission p) {
        if (p.input() == null) return "";
        try {
            JsonElement el = JsonParser.parseString(p.input());
            if (el.isJsonObject()) {
                JsonObject o = el.getAsJsonObject();
                for (String key : new String[] {"command", "file_path", "url", "path", "pattern"}) {
                    if (o.has(key) && o.get(key).isJsonPrimitive()) return o.get(key).getAsString();
                }
            }
        } catch (RuntimeException ignored) {
            // Not JSON: show it raw.
        }
        return p.input();
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
        if (statusChanged) rebuildWidgets();
    }

    private void pushItems() {
        List<Transcript.Item> items = new ArrayList<>(history);
        if (live != null) items.addAll(live.items());
        if (conversation != null && conversation.queued() > 0) {
            items.add(new Transcript.Note(conversation.queued() + " message(s) queued — they run after this one.", false));
        }
        view.setItems(items);
    }

    private void follow(String runId) {
        closeStream();
        streamingRunId = runId;
        lastFollowedRunId = runId;
        streamSawEnd = false;
        live = new Transcript.Live();
        stream = client.stream(runId, Connection.IO, event -> onMain(() -> onEvent(runId, event)), err -> onMain(() -> {
            if (!runId.equals(streamingRunId)) return;
            streamingRunId = null;
            stream = null;
            // Only a real end marks the run; after a drop, the refresh re-attaches and the server
            // replays the whole run ("attached" + event log).
            endedRunId = streamSawEnd ? runId : null;
            if (err != null) flash("Lost the live stream: " + err.getMessage());
            refreshLater();
        }));
    }

    private void onEvent(String runId, Api.Event event) {
        if (!runId.equals(streamingRunId) || live == null) return;
        if (!live.apply(event)) {
            if ("permission-request".equals(event.name())) loadPermissions();
            return;
        }
        switch (event.name()) {
            case "done", "error" -> streamSawEnd = true;
            case "attached" -> loadPermissions(); // requests aren't replayed: read what's parked now
            default -> { }
        }
        String tool = live.runningTool();
        if (conversation != null && conversation.running()) status = tool != null ? "Working: " + tool : "Working…";
        pushItems();
    }

    // ── input ───────────────────────────────────────────────────────────────

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        boolean enter = keyCode == GLFW.GLFW_KEY_ENTER || keyCode == GLFW.GLFW_KEY_KP_ENTER;
        if (enter && input != null && input.isFocused() && (modifiers & GLFW.GLFW_MOD_SHIFT) == 0) {
            send();
            return true;
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button == 0 && view.isMouseOver(mouseX, mouseY)) {
            Style style = view.styleAt(mouseX, mouseY);
            if (style != null && style.getClickEvent() != null && handleComponentClicked(style)) return true;
            if (view.click(mouseX, mouseY)) return true;
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (view.isMouseOver(mouseX, mouseY)) {
            view.scroll(scrollY);
            return true;
        }
        return super.mouseScrolled(mouseX, mouseY, scrollX, scrollY);
    }

    @Override
    public void tick() {
        super.tick();
        ticks++;
        if (flashTicks > 0) flashTicks--;
        if (seatPatchIn > 0 && --seatPatchIn == 0) sendSeatPatch(true);
        if (ticks % PERMISSION_POLL_TICKS == 0) loadPermissions();
    }

    // ── drawing ─────────────────────────────────────────────────────────────

    /** The roster's well (WorkspaceScreen), then the transcript's. */
    @Override
    protected void renderWells(GuiGraphics g) {
        super.renderWells(g);
        well(g, left, areaTop, right - left, areaBottom - areaTop);
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.renderBackground(g, mouseX, mouseY, partialTick);
        int x0 = left + 5;
        int x1 = right - 5;
        if (attentionY >= 0) {
            g.fill(x0, attentionY, x1, attentionY + ATTENTION_BAR, 0x1AFBBF24);
            g.fill(x0, attentionY, x0 + 2, attentionY + ATTENTION_BAR, Theme.AMBER);
        }
        for (PermissionCard card : cards) {
            g.fill(x0, card.y(), x1, card.y() + card.h(), 0x1FFBBF24);
            g.renderOutline(x0, card.y(), x1 - x0, card.h(), 0x4DFBBF24);
        }
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        int x0 = left + 5;
        int x1 = right - 5;
        // Status dot, the agent, which of its sessions this is, then the status, on the window like a
        // container title. The project is the selected tab. Short of room, the status goes first, then
        // the session, then the name is cut.
        g.blitSprite(Theme.dot(conversation == null ? null : conversation.status()), left, top + 7, 6, 6);
        int tx = left + 10;
        int end = headerRight - 8;
        int ty = top + 6;
        FormattedCharSequence name = bold(slot.agentId(), end - tx);
        g.drawString(font, name, tx, ty, PANEL_TEXT, false);
        tx += font.width(name) + 6;
        String which = sessionName(slot);
        if (end - tx >= font.width(which)) {
            g.drawString(font, which, tx, ty, PANEL_MUTED, false);
            tx += font.width(which) + 6;
            String state = flashTicks > 0 && flash != null ? flash : status;
            if (end - tx > 24) {
                g.drawString(font, WorkspaceScreen.cut(font, state, end - tx), tx, ty, flashTicks > 0 ? PANEL_TEXT : statusColor(), false);
            }
        }

        view.render(g, mouseX, mouseY);
        if (view.isEmpty()) {
            int cx = (x0 + x1) / 2;
            int cy = (areaTop + areaBottom) / 2;
            if (conversation == null) {
                g.drawCenteredString(font, WorkspaceScreen.cut(font, status, x1 - x0 - 16), cx, cy - 4, Theme.TXT_4);
            } else {
                g.drawCenteredString(font, Component.literal(slot.displayName()).withStyle(s -> s.withBold(true)), cx, cy - 16, Theme.GREEN);
                g.drawCenteredString(font, "No messages yet", cx, cy - 2, Theme.TXT_3);
                g.drawCenteredString(font, "Enter sends · Shift+Enter adds a line", cx, cy + 10, Theme.TXT_4);
            }
        }
        if (view.isMouseOver(mouseX, mouseY)) {
            Style style = view.styleAt(mouseX, mouseY);
            if (style != null) g.renderComponentHoverEffect(font, style, mouseX, mouseY);
        }

        if (attentionY >= 0) {
            g.drawString(font, "Needs attention: the last turn failed or was stopped.", x0 + 7, attentionY + 6, Theme.AMBER, false);
        }
        for (int c = 0; c < cards.size(); c++) {
            PermissionCard card = cards.get(c);
            String more = c == cards.size() - 1 && hiddenApprovals > 0 ? "   +" + hiddenApprovals + " more waiting" : "";
            g.drawString(font, Component.literal("Allow " + card.permission().tool() + "?").withStyle(s -> s.withBold(true))
                    .append(Component.literal(more).withStyle(s -> s.withBold(false).withColor(Theme.TXT_3))),
                    x0 + 6, card.y() + 7, Theme.AMBER, false);
            for (int i = 0; i < card.lines().size(); i++) {
                g.drawString(font, card.lines().get(i), x0 + 6, card.y() + 20 + i * 10, Theme.TXT_2, false);
            }
            boolean over = mouseX >= x0 && mouseX < x1 - 108 && mouseY >= card.y() && mouseY < card.y() + card.h();
            if (over) g.renderTooltip(font, card.full(), mouseX, mouseY);
        }
    }

    private int statusColor() {
        if (conversation == null) return PANEL_MUTED;
        if (conversation.running()) return PANEL_WORKING;
        if (conversation.needsAttention()) return PANEL_ATTENTION;
        return PANEL_MUTED;
    }

    // ── lifecycle ───────────────────────────────────────────────────────────

    @Override
    public void onClose() {
        Minecraft.getInstance().setScreen(parent);
    }

    /** Also runs when an image or a link prompt opens on top; {@link #added} brings the chat back. */
    @Override
    protected void onRemoved() {
        closed = true;
        super.onRemoved();
        closeStream();
        // A picker change still settling must not be lost because the screen went away.
        seatPatchIn = 0;
        sendSeatPatch(false);
    }

    @Override
    public void added() {
        if (!closed) return;
        closed = false;
        started = false;
        busy = false; // its result may have been dropped while closed
        answering.clear();
        refreshPending = false; // its delayed refresh was dropped while closed
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

    private void flash(String message) {
        flash = message;
        flashTicks = 100;
    }

    private static String statusText(Api.Conversation c) {
        String base = switch (c.status() == null ? "" : c.status()) {
            case "running" -> "Working…";
            case "needs_attention" -> "Needs attention";
            default -> "Idle";
        };
        return c.queued() > 0 ? base + "  ·  " + c.queued() + " queued" : base;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String def(String agentDefault) {
        return agentDefault == null || agentDefault.isEmpty() ? "default" : agentDefault;
    }

    private static String cap(String s) {
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    /** Runs on the main thread, and not at all once this screen is gone. */
    private void onMain(Runnable r) {
        Minecraft.getInstance().execute(() -> {
            if (!closed) r.run();
        });
    }
}
