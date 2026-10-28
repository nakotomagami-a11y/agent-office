package dev.agentoffice.mc.client.screen;

import dev.agentoffice.mc.client.service.AgentStatus;
import dev.agentoffice.mc.client.service.Bodies;
import dev.agentoffice.mc.client.service.AgentOffice;
import dev.agentoffice.mc.client.ui.FlatButton;
import dev.agentoffice.mc.client.ui.TabletScreen;
import dev.agentoffice.mc.client.ui.Theme;
import dev.agentoffice.mc.core.AgentNames;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.AgentState;
import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.Async;
import dev.agentoffice.mc.core.Protocol;
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
                    placeButton.setTooltip(Tooltip.create(Component.literal("Move " + AgentNames.of(slot.agentId())
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
        AgentOffice.call(() -> !closed, c -> new Loaded(c, c.projects(), c.agents()), r -> {
            loading = false;
            client = r.client();
            projects = r.projects();
            agents.clear();
            for (Api.Agent a : r.agents()) agents.put(a.id(), a);
            if (selected() == null) {
                selectedId = projects.stream().filter(p -> p.instanceCount() > 0).map(Api.Project::id).findFirst()
                        .orElse(projects.isEmpty() ? null : projects.get(0).id());
            }
            status = projects.isEmpty() ? "No projects in Agent Office yet." : "Connected to " + client.base();
            loadSeats();
            rebuildWidgets();
        }, e -> {
            loading = false;
            status = "Agent Office isn't reachable. Is it running? (" + Async.message(e) + ")";
            rebuildWidgets();
        });
    }

    private record Loaded(AgentOfficeClient client, List<Api.Project> projects, List<Api.Agent> agents) {}

    private void select(String projectId) {
        selectedId = projectId;
        seatScroll = 0;
        seats = List.of();
        loadSeats();
        rebuildWidgets();
    }

    /** The selected project's seats; their statuses are watched from then on. */
    private void loadSeats() {
        Api.Project project = selected();
        if (project == null || client == null) return;
        AgentOffice.call(client, () -> !closed, c -> c.instances(project), found -> {
            if (!project.id().equals(selectedId)) return;
            seats = found;
            AgentStatus.watch(this, found.stream().map(Api.Instance::slot).toList());
            rebuildWidgets();
        }, e -> status = "Couldn't read " + project.name() + ": " + Async.message(e));
    }

    private void confirmRemove(Api.Slot slot) {
        minecraft.setScreen(new ConfirmScreen(yes -> {
            minecraft.setScreen(this);
            if (!yes) return;
            // Always delivered, even while this screen is covered: a body must not outlive the seat it talks to.
            AgentOffice.call(client, () -> true, c -> {
                c.removeInstance(slot);
                return slot;
            }, removed -> {
                Bodies.seatRemoved(Minecraft.getInstance(), removed);
                if (closed) return;
                status = "Removed " + removed.displayName() + ".";
                load();
            }, e -> {
                if (!closed) status = refusal(e);
            });
        }, Component.literal("Remove " + slot.displayName() + " from " + slot.projectName() + "?"),
                Component.literal("The chat history is archived, not deleted. Its git worktree and branch are deleted, "
                        + "but only if they hold no work: with uncommitted changes or unmerged commits it is not removed "
                        + "and nothing is lost. Files git ignores (.env) go with the folder."),
                Component.literal("Remove"), Component.literal("Cancel")));
    }

    /** Starts with "Couldn't": the header then shows it alone. */
    private static String refusal(Exception e) {
        if (!(e instanceof Api.ApiException a) || a.status != 409) return "Couldn't remove: " + Async.message(e);
        if (Protocol.SessionRemoval.RUNNING.equals(a.code)) return "Couldn't remove: it is still working. Stop it first.";
        if (Protocol.SessionRemoval.REMOVE_FAILED.equals(a.code)) {
            return "Couldn't remove: git kept its worktree. Close anything open inside it, then try again.";
        }
        if (!Protocol.SessionRemoval.HAS_WORK.equals(a.code)) return "Couldn't remove: " + Async.message(e);
        long uncommitted = 0, unmerged = 0;
        boolean unknown = false;
        for (Api.SessionAtRisk s : a.sessions) {
            uncommitted += s.uncommitted();
            unmerged += s.unmerged();
            unknown |= s.unknown();
        }
        String work = unknown && uncommitted == 0 && unmerged == 0 ? "git couldn't check its worktree"
                : "its worktree has " + plural(uncommitted, "uncommitted change") + " and "
                        + plural(unmerged, "commit") + " on no other branch";
        return "Couldn't remove: " + work + ". Nothing was lost; to keep or discard it, remove it in the Agent Office app.";
    }

    private static String plural(long n, String noun) {
        return n + " " + noun + (n == 1 ? "" : "s");
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
            AgentState st = AgentStatus.of(slot);
            int dot = st == null ? Theme.BG_4 : switch (st) {
                case WORKING -> Theme.OK;
                case NEEDS_YOU -> Theme.AMBER;
                case IDLE, OFFLINE, UNKNOWN -> Theme.TXT_4;
            };
            g.fill(mx0 + 6, y + 8, mx0 + 10, y + 12, dot);
            int textW = mx1 - mx0 - buttonsW - 16;
            String name = slot.displayName() + (slot.label() != null && !slot.label().isBlank() ? "  (" + AgentNames.of(slot.agentId()) + ")" : "");
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

    private static String statusLabel(AgentState st) {
        if (st == null) return "…";
        return switch (st) {
            case WORKING -> "working";
            case NEEDS_YOU -> "needs you";
            case OFFLINE -> "Agent Office closed";
            case UNKNOWN -> "status unknown";
            case IDLE -> "idle";
        };
    }

    private static int clamp(int v, int max) {
        return Math.max(0, Math.min(v, max));
    }

    @Override
    protected void onRemoved() {
        closed = true;
        AgentStatus.unwatch(this);
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
}
