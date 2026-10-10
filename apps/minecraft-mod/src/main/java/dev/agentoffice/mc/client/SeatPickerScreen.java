package dev.agentoffice.mc.client;

import dev.agentoffice.mc.client.ui.FlatButton;
import dev.agentoffice.mc.client.ui.TabletScreen;
import dev.agentoffice.mc.client.ui.Theme;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * One agent's seats in one project, from its chat: an agent's body stands for all of them, and this
 * is where the chat (and the body) switches which seat it talks to, or adds another seat.
 */
final class SeatPickerScreen extends TabletScreen {
    private static final int ROW = 26;

    /** The chat this was opened from: Back returns to it as it was (draft, scroll). */
    private final ChatScreen chat;
    private final Screen chatParent;
    private final AgentOfficeClient client;
    private final Api.Slot current;
    private final Api.Project project;
    private List<Api.Instance> seats = List.of();
    /** Each seat's conversation status (idle / running / needs_attention / unknown), filled in after the list. */
    private final Map<String, String> status = new HashMap<>();
    /** The seat the agent's body in this world talks to, which may not be the chat's; null without a body. */
    private Api.Slot bodySeat;
    private String message = "Loading seats…";
    private int scroll;
    private boolean busy;

    SeatPickerScreen(ChatScreen chat, Screen chatParent, AgentOfficeClient client, Api.Slot current) {
        super(Component.literal(current.agentId() + " seats"));
        this.chat = chat;
        this.chatParent = chatParent;
        this.client = client;
        this.current = current;
        this.project = new Api.Project(current.projectId(), current.projectName(), 0);
        load();
    }

    private void load() {
        Minecraft mc = Minecraft.getInstance();
        Connection.IO.execute(() -> {
            List<Api.Instance> found;
            try {
                found = client.instances(project).stream().filter(i -> current.agentId().equals(i.slot().agentId())).toList();
            } catch (IOException | RuntimeException e) {
                mc.execute(() -> {
                    message = "Couldn't read the seats: " + e.getMessage();
                    if (mc.screen == this) rebuildWidgets();
                });
                return;
            }
            mc.execute(() -> {
                seats = found;
                message = found.size() == 1 ? "1 seat" : found.size() + " seats";
                if (mc.screen == this) rebuildWidgets();
            });
            for (Api.Instance i : found) {
                String s;
                try {
                    s = client.current(i.slot()).map(Api.Conversation::status).orElse("idle");
                } catch (IOException | RuntimeException e) {
                    s = "unknown";
                }
                String st = s;
                mc.execute(() -> status.put(i.slot().instanceId(), st));
            }
        });
    }

    @Override
    protected void init() {
        super.init();
        bodySeat = Bodies.seatOf(Minecraft.getInstance(), current);
        int x0 = left + PAD;
        int x1 = right - PAD;
        int listTop = top + 34;
        int visible = Math.max(1, (bottom - PAD - 20 - listTop) / ROW);
        scroll = Math.max(0, Math.min(scroll, Math.max(0, seats.size() - visible)));
        for (int i = scroll; i < Math.min(seats.size(), scroll + visible); i++) {
            Api.Slot s = seats.get(i).slot();
            // Current only when both the chat and the body (if any) already talk to it; otherwise Use switches them.
            boolean settled = same(s, current) && (bodySeat == null || same(s, bodySeat));
            FlatButton use = addRenderableWidget(new FlatButton(x1 - 66, listTop + (i - scroll) * ROW + 5, 62, 14,
                    settled ? "Current" : "Use", settled ? FlatButton.Kind.GHOST : FlatButton.Kind.PRIMARY, b -> use(s)));
            use.active = !busy && !settled;
        }
        int by = bottom - PAD - 16;
        addRenderableWidget(new FlatButton(x0, by, 60, 16, "Back", FlatButton.Kind.GHOST, b -> back()));
        addRenderableWidget(new FlatButton(x1 - 100, by, 100, 16, "+ New seat", FlatButton.Kind.PRIMARY, b -> addSeat())).active = !busy;
    }

    private static boolean same(Api.Slot a, Api.Slot b) {
        return a.instanceId().equals(b.instanceId());
    }

    /** That seat's chat; the agent's body in this world talks to it from now on. */
    private void use(Api.Slot slot) {
        Minecraft mc = Minecraft.getInstance();
        if (bodySeat != null && !same(slot, bodySeat)) Bodies.switchSeat(mc, slot);
        mc.setScreen(same(slot, current) ? chat : new ChatScreen(chatParent, client, slot));
    }

    private void back() {
        Minecraft.getInstance().setScreen(chat);
    }

    private void addSeat() {
        busy = true;
        message = "Adding a " + current.agentId() + " seat… (making a git worktree can take a while)";
        rebuildWidgets();
        SeatAdder.add(this, client, project, current.agentId(), slot -> {
            busy = false;
            Minecraft mc = Minecraft.getInstance();
            if (mc.screen == this) use(slot);
            else mc.gui.setOverlayMessage(Component.literal("Added " + slot.instanceId() + " to " + project.name()), false);
        }, msg -> {
            busy = false;
            message = msg;
            Minecraft mc = Minecraft.getInstance();
            if (mc.screen == this) rebuildWidgets();
            else mc.gui.setOverlayMessage(Component.literal(msg), false);
        });
    }

    @Override
    public void onClose() {
        back();
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        scroll -= (int) Math.signum(scrollY);
        rebuildWidgets();
        return true;
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.renderBackground(g, mouseX, mouseY, partialTick);
        g.fill(left, top + 30, right, top + 31, Theme.EDGE_2);
        int listTop = top + 34;
        int visible = Math.max(1, (bottom - PAD - 20 - listTop) / ROW);
        for (int i = scroll; i < Math.min(seats.size(), scroll + visible); i++) {
            int y = listTop + (i - scroll) * ROW;
            boolean here = same(seats.get(i).slot(), current);
            g.fill(left + PAD, y, right - PAD, y + ROW - 2, here ? Theme.CARD_3 : Theme.CARD_2);
            if (here) g.fill(left + PAD, y, left + PAD + 2, y + ROW - 2, Theme.ACCENT);
        }
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        int x0 = left + PAD;
        int x1 = right - PAD;
        g.drawString(font, bold(current.agentId() + " in " + current.projectName() + " · which seat?", x1 - x0), x0, top + 7, Theme.TXT, false);
        g.drawString(font, font.plainSubstrByWidth(message, x1 - x0), x0, top + 18, Theme.TXT_3, false);
        int listTop = top + 34;
        int visible = Math.max(1, (bottom - PAD - 20 - listTop) / ROW);
        int textW = x1 - x0 - 80;
        for (int i = scroll; i < Math.min(seats.size(), scroll + visible); i++) {
            Api.Instance seat = seats.get(i);
            Api.Slot s = seat.slot();
            int y = listTop + (i - scroll) * ROW;
            String name = s.label() != null && !s.label().isBlank() ? s.label() : s.instanceId();
            String where = (same(s, current) ? "  · this chat" : "") + (bodySeat != null && same(s, bodySeat) ? "  · body" : "");
            g.drawString(font, bold(name, textW), x0 + 6, y + 3, Theme.TXT, false);
            g.drawString(font, font.plainSubstrByWidth(where, Math.max(0, textW - font.width(bold(name, textW)))),
                    x0 + 6 + font.width(bold(name, textW)), y + 3, Theme.TXT_4, false);
            String st = status.get(s.instanceId());
            String meta = (seat.model() == null || seat.model().isEmpty() ? "default model" : seat.model())
                    + (seat.effort() == null || seat.effort().isEmpty() ? "" : " · " + seat.effort())
                    + (st == null ? "" : " · " + label(st));
            g.drawString(font, font.plainSubstrByWidth(meta, textW), x0 + 6, y + 14, statusColor(st), false);
        }
    }

    private static String label(String status) {
        return switch (status) {
            case "running" -> "working…";
            case "needs_attention" -> "needs you";
            case "unknown" -> "status unknown";
            default -> "idle";
        };
    }

    private static int statusColor(String status) {
        if (status == null) return Theme.TXT_4;
        return switch (status) {
            case "running" -> Theme.AMBER;
            case "needs_attention" -> Theme.RED;
            default -> Theme.TXT_4;
        };
    }
}
