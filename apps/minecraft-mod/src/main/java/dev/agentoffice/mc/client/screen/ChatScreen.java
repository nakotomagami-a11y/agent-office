package dev.agentoffice.mc.client.screen;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.agentoffice.mc.client.service.AgentOffice;
import dev.agentoffice.mc.client.service.Bodies;
import dev.agentoffice.mc.client.service.ClipboardImages;
import dev.agentoffice.mc.client.ui.FlatButton;
import dev.agentoffice.mc.client.ui.FlatCycle;
import dev.agentoffice.mc.client.ui.ImageScreen;
import dev.agentoffice.mc.client.ui.ShowsImages;
import dev.agentoffice.mc.client.ui.Theme;
import dev.agentoffice.mc.client.ui.TranscriptView;
import dev.agentoffice.mc.core.AgentNames;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.ChatSession;
import dev.agentoffice.mc.core.Protocol;
import dev.agentoffice.mc.core.ServerMirror;
import dev.agentoffice.mc.core.Transcript;
import java.util.ArrayList;
import java.util.List;
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
 * One agent seat's conversation, on the tablet: draws what its {@link ChatSession} holds, like the web chat does, and
 * hands it what the player does. The session reads, streams and sends; this lays out, takes input and draws.
 */
public final class ChatScreen extends WorkspaceScreen implements ShowsImages {
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
    private static final int PERMISSION_LINES = 4;
    /** Approval cards never squeeze the transcript below this. */
    private static final int MIN_TRANSCRIPT = 60;
    private static final int TOOLTIP_LINES = 40;

    private final Screen parent;
    private final Api.Slot slot;
    private final ChatSession session;
    private final TranscriptView view;
    private MultiLineEditBox input;
    private int shownLines = 1;
    private String flash;
    private int flashTicks;

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
        this.slot = slot;
        this.session = new ChatSession(AgentOffice.CHAT, client, slot, new ChatSession.Listener() {
            @Override
            public void items(List<Transcript.Item> items) {
                view.setItems(items);
            }

            @Override
            public void changed() {
                rebuildWidgets();
            }

            @Override
            public void flash(String message) {
                ChatScreen.this.flash(message);
            }

            @Override
            public void unsent(String text) {
                if (input != null && input.getValue().isEmpty()) input.setValue(text);
            }
        });
        this.view = new TranscriptView(Minecraft.getInstance().font, session::client, slot.displayName(),
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
        Api.Conversation conversation = session.conversation();
        Api.Instance seat = session.seat();
        Api.Agent agent = session.agent();
        addRenderableWidget(new FlatButton(hx, hy, newW, 20, "New", FlatButton.Kind.NORMAL, b -> session.act(Protocol.Action.NEW)))
                .active = conversation != null && !session.busy();
        if (seat != null) {
            // Labelled like vanilla's options ("Model: opus"); unset shows the agent's default.
            String modelDef = def(agent == null ? null : agent.defaultModel());
            String effortDef = def(agent == null ? null : agent.defaultEffort());
            Function<String, String> model = v -> "Model: " + (v.isEmpty() ? modelDef : v);
            Function<String, String> effort = v -> "Effort: " + (v.isEmpty() ? effortDef : v);
            if (titleRoom(hx, cycleWidth(ServerMirror.MODELS, seat.model(), model), cycleWidth(ServerMirror.EFFORTS, seat.effort(), effort), x0) < MIN_TITLE) {
                model = v -> v.isEmpty() ? modelDef : v;
                effort = v -> v.isEmpty() ? effortDef : v;
            }
            int ew = cycleWidth(ServerMirror.EFFORTS, seat.effort(), effort);
            int mw = cycleWidth(ServerMirror.MODELS, seat.model(), model);
            if (titleRoom(hx, ew, mw, x0) >= MIN_TITLE / 2) {
                Tooltip hint = Tooltip.create(Component.literal("Click: next · Right-click: previous"));
                hx -= 4 + ew;
                addRenderableWidget(new FlatCycle<>(hx, hy, ew, 20, ServerMirror.EFFORTS, nz(seat.effort()), effort)
                        .onChange(v -> session.changeSeat("effort", v))).setTooltip(hint);
                hx -= 4 + mw;
                addRenderableWidget(new FlatCycle<>(hx, hy, mw, 20, ServerMirror.MODELS, nz(seat.model()), model)
                        .onChange(v -> session.changeSeat("model", v))).setTooltip(hint);
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
            addRenderableWidget(new FlatButton(x1 - sendW - 4 - stopW, by, stopW, 20, "Stop", FlatButton.Kind.DANGER, b -> session.stop()))
                    .active = !session.busy();
        }

        // Pasted images wait above the composer until sent; a click takes one off.
        List<ChatSession.Attached> all = session.attachments();
        if (!all.isEmpty()) {
            cy -= 20;
            int ax = x0;
            for (int i = 0; i < all.size(); i++) {
                ChatSession.Attached a = all.get(i);
                String chip = (a.path() == null ? "… " : "✕ ") + font.plainSubstrByWidth(a.name(), 110);
                int w = buttonWidth(chip);
                // No room for this one and a "+N" after it: the rest go in one chip that drops them all.
                if (ax + w + buttonWidth("✕ +" + (all.size() - i)) + 4 > x1) {
                    List<ChatSession.Attached> hidden = all.subList(i, all.size());
                    addRenderableWidget(new FlatButton(ax, cy, buttonWidth("✕ +" + hidden.size()), 16, "✕ +" + hidden.size(),
                            FlatButton.Kind.NORMAL, x -> session.unattach(hidden))).setTooltip(Tooltip.create(Component.literal("Don't send these " + hidden.size() + " images")));
                    break;
                }
                FlatButton b = addRenderableWidget(new FlatButton(ax, cy, w, 16, chip, FlatButton.Kind.NORMAL, x -> session.unattach(List.of(a))));
                b.active = a.path() != null;
                b.setTooltip(Tooltip.create(Component.literal(a.path() == null ? "Uploading…" : "Don't send " + a.name())));
                ax += w + 4;
            }
        }

        // At the bottom of the transcript's well: needs-attention actions, then pending approvals.
        areaBottom = cy - 6;
        int above = areaBottom - 5;
        attentionY = -1;
        if (conversation != null && conversation.needsAttention()) {
            above -= ATTENTION_BAR;
            attentionY = above;
            int bx = wx1 - 3;
            for (Protocol.Action action : new Protocol.Action[] {Protocol.Action.SKIP, Protocol.Action.RESUME, Protocol.Action.RETRY}) {
                int w = buttonWidth(action.label());
                bx -= w;
                addRenderableWidget(new FlatButton(bx, above + 3, w, 16, action.label(),
                        action == Protocol.Action.RETRY ? FlatButton.Kind.PRIMARY : FlatButton.Kind.NORMAL, b -> session.act(action))).active = !session.busy();
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
        List<Api.Permission> pending = session.pending();
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
            boolean waiting = session.answering(p.id());
            addRenderableWidget(new FlatButton(wx1 - 103, above + 4, 48, 16, "Deny", FlatButton.Kind.DANGER, b -> session.answer(p, false))).active = !waiting;
            addRenderableWidget(new FlatButton(wx1 - 51, above + 4, 48, 16, "Allow", FlatButton.Kind.PRIMARY, b -> session.answer(p, true))).active = !waiting;
            above -= 6;
        }
        // The transcript fills the rest of its well.
        areaTop = transcriptTop;
        view.setBounds(wx0, areaTop + 5, wx1 - wx0, Math.max(0, above - (areaTop + 5)));

        session.start();
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

    // ── what the player does ────────────────────────────────────────────────

    private void send() {
        if (session.send(input.getValue())) {
            input.setValue("");
            view.scrollToBottom();
        }
    }

    /** Ctrl+V (Cmd+V on a Mac), from the key event's own modifiers rather than what the keyboard holds right now. */
    private static boolean isPaste(int keyCode, int modifiers) {
        int command = Minecraft.ON_OSX ? GLFW.GLFW_MOD_SUPER : GLFW.GLFW_MOD_CONTROL;
        return keyCode == GLFW.GLFW_KEY_V && (modifiers & command) != 0 && (modifiers & (GLFW.GLFW_MOD_SHIFT | GLFW.GLFW_MOD_ALT)) == 0;
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

    // ── input ───────────────────────────────────────────────────────────────

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        boolean enter = keyCode == GLFW.GLFW_KEY_ENTER || keyCode == GLFW.GLFW_KEY_KP_ENTER;
        if (enter && input != null && input.isFocused() && (modifiers & GLFW.GLFW_MOD_SHIFT) == 0) {
            send();
            return true;
        }
        // Text on the clipboard pastes as text (the box does it); nothing but an image goes up as an attachment.
        if (isPaste(keyCode, modifiers) && input != null && input.isFocused() && minecraft.keyboardHandler.getClipboard().isEmpty()) {
            session.paste(ClipboardImages::read);
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
        if (flashTicks > 0) flashTicks--;
        session.tick();
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
            g.fill(x0, attentionY, x1, attentionY + ATTENTION_BAR, Theme.withAlpha(Theme.AMBER, 0x1A));
            g.fill(x0, attentionY, x0 + 2, attentionY + ATTENTION_BAR, Theme.AMBER);
        }
        for (PermissionCard card : cards) {
            g.fill(x0, card.y(), x1, card.y() + card.h(), Theme.withAlpha(Theme.AMBER, 0x1F));
            g.renderOutline(x0, card.y(), x1 - x0, card.h(), Theme.withAlpha(Theme.AMBER, 0x4D));
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
        Api.Conversation conversation = session.conversation();
        g.blitSprite(Theme.dot(conversation == null ? null : conversation.status()), left, top + 7, 6, 6);
        int tx = left + 10;
        int end = headerRight - 8;
        int ty = top + 6;
        FormattedCharSequence name = bold(AgentNames.of(slot.agentId()), end - tx);
        g.drawString(font, name, tx, ty, PANEL_TEXT, false);
        tx += font.width(name) + 6;
        String which = sessionName(slot);
        if (end - tx >= font.width(which)) {
            g.drawString(font, which, tx, ty, PANEL_MUTED, false);
            tx += font.width(which) + 6;
            String state = flashTicks > 0 && flash != null ? flash : session.status();
            if (end - tx > 24) {
                g.drawString(font, WorkspaceScreen.cut(font, state, end - tx), tx, ty, flashTicks > 0 ? PANEL_TEXT : statusColor(), false);
            }
        }

        view.render(g, mouseX, mouseY);
        if (view.isEmpty()) {
            int cx = (x0 + x1) / 2;
            int cy = (areaTop + areaBottom) / 2;
            if (conversation == null) {
                g.drawCenteredString(font, WorkspaceScreen.cut(font, session.status(), x1 - x0 - 16), cx, cy - 4, Theme.TXT_4);
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
        Api.Conversation conversation = session.conversation();
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
        super.onRemoved();
        // A picker change still settling goes out now: it must not be lost because the screen went away.
        session.close();
    }

    @Override
    public void added() {
        session.reopen();
    }

    private void flash(String message) {
        flash = message;
        flashTicks = 100;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String def(String agentDefault) {
        return agentDefault == null || agentDefault.isEmpty() ? "default" : agentDefault;
    }
}
