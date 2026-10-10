package dev.agentoffice.mc.client;

import dev.agentoffice.mc.client.ui.FlatButton;
import dev.agentoffice.mc.client.ui.TabletScreen;
import dev.agentoffice.mc.client.ui.Theme;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.network.chat.Component;

/**
 * The tablet's home: every project on the left, the selected project's agent seats on the right with
 * their live status and settings. Chat, place a body, change a seat, add or remove seats.
 */
public final class OfficeScreen extends TabletScreen {
    private static final int SIDEBAR = 118;
    private static final int PROJECT_ROW = 16;
    private static final int SEAT_ROW = 34;
    private static final int HEADER = 30;

    private AgentOfficeClient client;
    private List<Api.Project> projects = List.of();
    private String selectedId;
    private List<Api.Instance> seats = List.of();
    private final Map<String, String> seatStatus = new HashMap<>();
    private final Map<String, Api.Agent> agents = new HashMap<>();
    private String status = "Connecting to Agent Office…";
    private boolean loading;
    private int projectScroll;
    private int seatScroll;
    private boolean started;
    private boolean closed;

    public OfficeScreen() {
        super(Component.literal("Agent Office"));
    }

    @Override
    protected void init() {
        super.init();
        int sx = left + PAD;
        int sideTop = top + HEADER + 4;
        int visibleProjects = Math.max(1, (bottom - PAD - sideTop) / PROJECT_ROW);
        projectScroll = clamp(projectScroll, Math.max(0, projects.size() - visibleProjects));
        for (int i = projectScroll; i < Math.min(projects.size(), projectScroll + visibleProjects); i++) {
            Api.Project p = projects.get(i);
            boolean sel = p.id().equals(selectedId);
            String label = p.name() + (p.instanceCount() > 0 ? "  " + p.instanceCount() : "");
            addRenderableWidget(new FlatButton(sx, sideTop + (i - projectScroll) * PROJECT_ROW, SIDEBAR - 4, PROJECT_ROW - 2, label,
                    sel ? FlatButton.Kind.NORMAL : FlatButton.Kind.GHOST, b -> select(p.id())).alignLeft());
        }

        int mx0 = left + PAD + SIDEBAR + PAD;
        int mx1 = right - PAD;
        addRenderableWidget(new FlatButton(mx1 - 50, top + 8, 50, 14, "Refresh", FlatButton.Kind.GHOST, b -> load()));
        Api.Project project = selected();
        if (project != null) {
            addRenderableWidget(new FlatButton(mx1 - 50 - 4 - 80, top + 8, 80, 14, "+ Add agent", FlatButton.Kind.PRIMARY,
                    b -> minecraft.setScreen(new AddAgentScreen(this, client, project))));
        }

        boolean inWorld = Minecraft.getInstance().level != null;
        int listTop = top + HEADER + 4;
        int visibleSeats = Math.max(1, (bottom - PAD - listTop) / SEAT_ROW);
        seatScroll = clamp(seatScroll, Math.max(0, seats.size() - visibleSeats));
        for (int i = seatScroll; i < Math.min(seats.size(), seatScroll + visibleSeats); i++) {
            Api.Instance seat = seats.get(i);
            Api.Slot slot = seat.slot();
            int y = listTop + (i - seatScroll) * SEAT_ROW + 9;
            int bx = mx1 - 6;
            bx -= 18;
            addRenderableWidget(new FlatButton(bx, y, 18, 14, "✕", FlatButton.Kind.DANGER, b -> confirmRemove(slot)));
            bx -= 22;
            addRenderableWidget(new FlatButton(bx, y, 18, 14, "⚙", FlatButton.Kind.NORMAL,
                    b -> minecraft.setScreen(new SeatSettingsScreen(this, client, seat, agents.get(slot.agentId())))));
            if (inWorld) {
                bx -= 44;
                // One body per agent per project: on another of its seats, this moves it and switches it to this one.
                Api.Slot standing = Bodies.seatOf(Minecraft.getInstance(), slot);
                String label = standing == null ? "Place" : standing.instanceId().equals(slot.instanceId()) ? "Move" : "Use";
                FlatButton placeButton = addRenderableWidget(new FlatButton(bx, y, 40, 14, label,
                        FlatButton.Kind.NORMAL, b -> {
                            Bodies.place(Minecraft.getInstance(), slot);
                            onClose();
                        }));
                if (label.equals("Use")) {
                    placeButton.setTooltip(Tooltip.create(Component.literal("Move " + slot.agentId()
                            + "'s body here, talking to this seat instead of " + (standing.label() != null && !standing.label().isBlank() ? standing.label() : standing.instanceId()))));
                }
            }
            bx -= 44;
            addRenderableWidget(new FlatButton(bx, y, 40, 14, "Chat", FlatButton.Kind.PRIMARY,
                    b -> minecraft.setScreen(new ChatScreen(this, client, slot))));
        }

        if (!started) {
            started = true;
            load();
        }
    }

    private Api.Project selected() {
        for (Api.Project p : projects) if (p.id().equals(selectedId)) return p;
        return null;
    }

    /** Reloads projects, the agent list, then the selected project's seats. */
    void load() {
        loading = true;
        status = "Connecting to Agent Office…";
        Connection.client().thenApplyAsync(c -> {
            try {
                return new Object[] {c, c.projects(), c.agents()};
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }, Connection.IO).whenComplete((r, err) -> onMain(() -> {
            loading = false;
            if (err != null) {
                status = "Agent Office isn't reachable. Is it running? (" + rootMessage(err) + ")";
                rebuildWidgets();
                return;
            }
            client = (AgentOfficeClient) r[0];
            @SuppressWarnings("unchecked") List<Api.Project> ps = (List<Api.Project>) r[1];
            @SuppressWarnings("unchecked") List<Api.Agent> as = (List<Api.Agent>) r[2];
            projects = ps;
            agents.clear();
            for (Api.Agent a : as) agents.put(a.name(), a);
            if (selected() == null) {
                selectedId = projects.stream().filter(p -> p.instanceCount() > 0).map(Api.Project::id).findFirst()
                        .orElse(projects.isEmpty() ? null : projects.get(0).id());
            }
            status = projects.isEmpty() ? "No projects in Agent Office yet." : "Connected to " + client.base();
            loadSeats();
            rebuildWidgets();
        }));
    }

    private void select(String projectId) {
        selectedId = projectId;
        seatScroll = 0;
        seats = List.of();
        loadSeats();
        rebuildWidgets();
    }

    /** The selected project's seats, then each seat's conversation status. */
    private void loadSeats() {
        Api.Project project = selected();
        if (project == null || client == null) return;
        AgentOfficeClient c = client;
        Connection.IO.execute(() -> {
            try {
                List<Api.Instance> found = c.instances(project);
                onMain(() -> {
                    if (!project.id().equals(selectedId)) return;
                    seats = found;
                    rebuildWidgets();
                });
                Map<String, String> statuses = new HashMap<>();
                for (Api.Instance i : found) {
                    try {
                        statuses.put(i.slot().instanceId(), c.current(i.slot()).map(Api.Conversation::status).orElse("idle"));
                    } catch (IOException e) {
                        statuses.put(i.slot().instanceId(), "unknown");
                    }
                }
                onMain(() -> seatStatus.putAll(statuses));
            } catch (IOException e) {
                onMain(() -> status = "Couldn't read " + project.name() + ": " + e.getMessage());
            }
        });
    }

    private void confirmRemove(Api.Slot slot) {
        minecraft.setScreen(new ConfirmScreen(yes -> {
            minecraft.setScreen(this);
            if (!yes) return;
            AgentOfficeClient c = client;
            Connection.IO.execute(() -> {
                try {
                    c.removeInstance(slot);
                    // Always, even if this screen is covered: a body must not outlive the seat it talks to.
                    Minecraft.getInstance().execute(() -> Bodies.seatRemoved(Minecraft.getInstance(), slot));
                    onMain(() -> {
                        status = "Removed " + slot.displayName() + ".";
                        load();
                    });
                } catch (IOException e) {
                    onMain(() -> status = "Couldn't remove: " + e.getMessage());
                }
            });
        }, Component.literal("Remove " + slot.displayName() + " from " + slot.projectName() + "?"),
                Component.literal("Its git worktree is deleted — uncommitted work in it is lost. "
                        + "The chat history is archived, not deleted."),
                Component.literal("Remove"), Component.literal("Cancel")));
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (mouseX < left + PAD + SIDEBAR) {
            projectScroll -= (int) Math.signum(scrollY);
        } else {
            seatScroll -= (int) Math.signum(scrollY);
        }
        rebuildWidgets();
        return true;
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.renderBackground(g, mouseX, mouseY, partialTick);
        int sideRight = left + PAD + SIDEBAR;
        // Inside the well's 1-px bevel.
        g.fill(left + 1, top + 1, sideRight, bottom - 1, Theme.CARD);
        g.fill(sideRight, top + 1, sideRight + 1, bottom - 1, Theme.EDGE_2);
        g.fill(left + 1, top + HEADER, right - 1, top + HEADER + 1, Theme.EDGE_2);
        int mx0 = sideRight + PAD;
        int mx1 = right - PAD;
        int listTop = top + HEADER + 4;
        int visibleSeats = Math.max(1, (bottom - PAD - listTop) / SEAT_ROW);
        for (int i = seatScroll; i < Math.min(seats.size(), seatScroll + visibleSeats); i++) {
            int y = listTop + (i - seatScroll) * SEAT_ROW;
            g.fill(mx0, y, mx1, y + SEAT_ROW - 3, Theme.CARD_2);
            g.renderOutline(mx0, y, mx1 - mx0, SEAT_ROW - 3, Theme.EDGE);
        }
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        g.drawString(font, Component.literal("Agent Office").withStyle(s -> s.withBold(true)), left + PAD, top + 7, Theme.TXT, false);
        g.drawString(font, "Projects", left + PAD, top + 18, Theme.TXT_4, false);

        int mx0 = left + PAD + SIDEBAR + PAD;
        int mx1 = right - PAD;
        Api.Project project = selected();
        int headerRight = mx1 - (project != null ? 140 : 56);
        if (project != null) {
            g.drawString(font, bold(project.name(), headerRight - mx0),
                    mx0, top + 7, Theme.TXT, false);
        }
        String sub = loading ? "Loading…" : project != null && !status.startsWith("Couldn't") && !status.startsWith("Removed")
                ? seats.size() + (seats.size() == 1 ? " agent" : " agents") + "  ·  " + status : status;
        g.drawString(font, font.plainSubstrByWidth(sub, headerRight - mx0), mx0, top + 18, Theme.TXT_3, false);

        int listTop = top + HEADER + 4;
        int visibleSeats = Math.max(1, (bottom - PAD - listTop) / SEAT_ROW);
        if (project != null && seats.isEmpty() && !loading) {
            g.drawString(font, "No agents in this project yet — add one with + Add agent.", mx0 + 4, listTop + 6, Theme.TXT_3, false);
        }
        boolean inWorld = Minecraft.getInstance().level != null;
        int buttonsW = 6 + 18 + 22 + 44 + (inWorld ? 44 : 0) + 6;
        for (int i = seatScroll; i < Math.min(seats.size(), seatScroll + visibleSeats); i++) {
            Api.Instance seat = seats.get(i);
            Api.Slot slot = seat.slot();
            int y = listTop + (i - seatScroll) * SEAT_ROW;
            String st = seatStatus.get(slot.instanceId());
            int dot = "running".equals(st) ? Theme.OK : "needs_attention".equals(st) ? Theme.AMBER : st == null ? Theme.BG_4 : Theme.TXT_4;
            g.fill(mx0 + 6, y + 8, mx0 + 10, y + 12, dot);
            int textW = mx1 - mx0 - buttonsW - 16;
            String name = slot.displayName() + (slot.label() != null && !slot.label().isBlank() ? "  (" + slot.agentId() + ")" : "");
            g.drawString(font, bold(name, textW), mx0 + 15, y + 6, Theme.TXT, false);
            Api.Agent def = agents.get(slot.agentId());
            String model = orDefault(seat.model(), def == null ? null : def.defaultModel());
            String effort = orDefault(seat.effort(), def == null ? null : def.defaultEffort());
            String line = statusLabel(st) + "  ·  " + model + "  ·  " + effort
                    + (seat.permissionMode() != null ? "  ·  " + seat.permissionMode() : "") + "  ·  " + slot.instanceId();
            g.drawString(font, font.plainSubstrByWidth(line, textW), mx0 + 15, y + 18, Theme.TXT_3, false);
        }
    }

    private static String orDefault(String own, String agentDefault) {
        if (own != null && !own.isEmpty()) return own;
        return agentDefault != null && !agentDefault.isEmpty() ? agentDefault : "default";
    }

    private static String statusLabel(String st) {
        if (st == null) return "…";
        return switch (st) {
            case "running" -> "working";
            case "needs_attention" -> "needs you";
            case "unknown" -> "status unknown";
            default -> "idle";
        };
    }

    private static int clamp(int v, int max) {
        return Math.max(0, Math.min(v, max));
    }

    @Override
    protected void onRemoved() {
        closed = true;
    }

    /** Back from a chat, settings or prompt: statuses and settings may have changed meanwhile. */
    @Override
    public void added() {
        closed = false;
        if (!started) return;
        // A load whose result arrived while covered was dropped: start over.
        if (loading || client == null) load();
        else loadSeats();
    }

    private void onMain(Runnable r) {
        Minecraft.getInstance().execute(() -> {
            if (!closed) r.run();
        });
    }

    static String rootMessage(Throwable t) {
        while (t.getCause() != null) t = t.getCause();
        return t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage();
    }
}
