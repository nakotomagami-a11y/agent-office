package dev.agentoffice.mc.client;

import dev.agentoffice.mc.client.ui.FlatButton;
import dev.agentoffice.mc.client.ui.TabletScreen;
import dev.agentoffice.mc.client.ui.Theme;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.network.chat.Component;

/**
 * Setting up an agent shell (placed from an Agent Spawn Egg): which agent is it, and which project
 * does it work on. The body is that agent in that project — every seat it has there — so there is no
 * seat to pick: it starts on the agent's first seat (or a new one if it has none), and the chat's Seats
 * picker switches between them. A shell can't be chatted with until this is done.
 */
final class AgentSetupScreen extends TabletScreen {
    private static final int ROW = 26;

    private enum Step { AGENT, PROJECT }

    /** One choice in the current step's list. */
    private record Row(String title, String meta, String detail, String button, Runnable action) {}

    private final AgentOfficeClient client;
    private final UUID shell;
    private Step step = Step.AGENT;
    private List<Api.Agent> agents = List.of();
    private List<Api.Project> projects = List.of();
    private Api.Agent agent;
    private Api.Project project;
    private EditBox filter;
    private String status = "Loading agents…";
    private int scroll;
    private boolean busy;
    private boolean started;

    AgentSetupScreen(AgentOfficeClient client, UUID shell) {
        super(Component.literal("Set up agent"));
        this.client = client;
        this.shell = shell;
    }

    @Override
    protected void init() {
        super.init();
        int x0 = left + PAD;
        int x1 = right - PAD;
        if (filter == null) {
            filter = new EditBox(font, x1 - 150, top + 8, 150, 14, Component.literal("Filter"));
            filter.setHint(Component.literal("Filter…").withColor(Theme.TXT_4));
            filter.setResponder(s -> {
                scroll = 0;
                rebuildWidgets();
            });
        }
        filter.setPosition(x1 - 150, top + 8);
        addRenderableWidget(filter);

        List<Row> rows = rows();
        int listTop = top + 34;
        int visible = Math.max(1, (bottom - PAD - 20 - listTop) / ROW);
        scroll = Math.max(0, Math.min(scroll, Math.max(0, rows.size() - visible)));
        for (int i = scroll; i < Math.min(rows.size(), scroll + visible); i++) {
            Row row = rows.get(i);
            addRenderableWidget(new FlatButton(x1 - 66, listTop + (i - scroll) * ROW + 5, 62, 14, row.button(), FlatButton.Kind.PRIMARY,
                    b -> row.action().run())).active = !busy;
        }

        int by = bottom - PAD - 16;
        addRenderableWidget(new FlatButton(x0, by, 90, 16, "Remove shell", FlatButton.Kind.DANGER, b -> {
            Bodies.removeShell(Minecraft.getInstance(), shell);
            onClose();
        })).active = !busy;
        if (step != Step.AGENT) {
            addRenderableWidget(new FlatButton(x0 + 96, by, 60, 16, "Back", FlatButton.Kind.GHOST, b -> back())).active = !busy;
        }
        setInitialFocus(filter);

        if (!started) {
            started = true;
            Connection.IO.execute(() -> {
                try {
                    List<Api.Agent> a = client.agents();
                    List<Api.Project> p = client.projects();
                    Minecraft.getInstance().execute(() -> {
                        agents = a;
                        projects = p;
                        status = a.size() + " agents";
                        if (minecraft.screen == this) rebuildWidgets();
                    });
                } catch (IOException | RuntimeException e) {
                    Minecraft.getInstance().execute(() -> status = "Couldn't reach Agent Office: " + e.getMessage() + " — close and reopen to retry");
                }
            });
        }
    }

    private List<Row> rows() {
        String q = filter == null ? "" : filter.getValue().trim().toLowerCase(Locale.ROOT);
        List<Row> out = new ArrayList<>();
        switch (step) {
            case AGENT -> {
                for (Api.Agent a : agents) {
                    if (!q.isEmpty() && !a.name().toLowerCase(Locale.ROOT).contains(q)
                            && (a.description() == null || !a.description().toLowerCase(Locale.ROOT).contains(q))) continue;
                    String meta = (a.defaultModel() == null ? "" : a.defaultModel()) + (a.defaultEffort() == null ? "" : " · " + a.defaultEffort());
                    out.add(new Row(a.name(), meta, a.description(), "Choose", () -> chooseAgent(a)));
                }
            }
            case PROJECT -> {
                for (Api.Project p : projects) {
                    if (!q.isEmpty() && !p.name().toLowerCase(Locale.ROOT).contains(q)) continue;
                    String meta = p.instanceCount() == 1 ? "1 agent" : p.instanceCount() + " agents";
                    out.add(new Row(p.name(), meta, null, "Choose", () -> chooseProject(p)));
                }
            }
        }
        return out;
    }

    private void chooseAgent(Api.Agent a) {
        agent = a;
        step = Step.PROJECT;
        status = projects.isEmpty() ? "No projects in Agent Office yet." : "";
        filter.setValue("");
        scroll = 0;
        rebuildWidgets();
    }

    /** The agent's first seat in the project, or a new one if it has none there yet. */
    private void chooseProject(Api.Project p) {
        project = p;
        busy = true;
        status = "Checking " + p.name() + "…";
        rebuildWidgets();
        Api.Agent chosen = agent;
        Connection.IO.execute(() -> {
            List<Api.Slot> seats;
            try {
                seats = SeatAdder.seats(client, p, chosen.name());
            } catch (IOException | RuntimeException e) {
                Minecraft.getInstance().execute(() -> fail("Couldn't read " + p.name() + ": " + e.getMessage()));
                return;
            }
            Minecraft.getInstance().execute(() -> {
                // Left, went back or picked something else meanwhile: never act on a stale choice.
                if (minecraft.screen != this || step != Step.PROJECT || project != p || agent != chosen) {
                    busy = false;
                    if (minecraft.screen == this) rebuildWidgets();
                    return;
                }
                if (!seats.isEmpty()) {
                    // Already standing somewhere in this world: it moves here and keeps talking to the same seat.
                    Api.Slot standing = Bodies.seatOf(minecraft, seats.get(0));
                    finish(seats.stream().filter(s -> standing != null && s.instanceId().equals(standing.instanceId()))
                            .findFirst().orElse(seats.get(0)));
                    return;
                }
                status = "Adding " + chosen.name() + " to " + p.name() + "… (making a git worktree can take a while)";
                rebuildWidgets();
                SeatAdder.add(this, client, p, chosen.name(), this::finish, this::fail);
            });
        });
    }

    private void fail(String message) {
        busy = false;
        status = message;
        if (minecraft.screen == this) rebuildWidgets();
    }

    /**
     * The shell becomes this seat's body; then its chat opens. A seat made after the player left this
     * screen still exists in Agent Office, so they are told either way.
     */
    private void finish(Api.Slot slot) {
        Minecraft mc = Minecraft.getInstance();
        busy = false;
        boolean here = mc.screen == this;
        boolean moved = Bodies.placed(mc, slot);
        if (!Bodies.assignShell(mc, shell, slot)) {
            String gone = slot.agentId() + " is set up in " + slot.projectName() + ", but this shell is gone (removed, or another world is loaded).";
            if (here) {
                status = gone;
                rebuildWidgets();
            } else {
                mc.gui.setOverlayMessage(Component.literal(gone), false);
            }
            return;
        }
        if (moved) {
            mc.gui.setOverlayMessage(Component.literal(slot.agentId() + " in " + slot.projectName() + " moved here (one body per agent per project)"), false);
        }
        if (here) mc.setScreen(new ChatScreen(null, client, slot));
        else if (!moved) mc.gui.setOverlayMessage(Component.literal("Set up " + slot.agentId() + " in " + slot.projectName()), false);
    }

    private void back() {
        step = Step.AGENT;
        status = "";
        filter.setValue("");
        scroll = 0;
        rebuildWidgets();
    }

    @Override
    protected GuiEventListener typingTarget() {
        return filter;
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
        g.fill(left + 1, top + 30, right - 1, top + 31, Theme.EDGE_2);
        List<Row> rows = rows();
        int listTop = top + 34;
        int visible = Math.max(1, (bottom - PAD - 20 - listTop) / ROW);
        for (int i = scroll; i < Math.min(rows.size(), scroll + visible); i++) {
            int y = listTop + (i - scroll) * ROW;
            g.fill(left + PAD, y, right - PAD, y + ROW - 2, Theme.CARD_2);
        }
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        int x0 = left + PAD;
        int x1 = right - PAD;
        String title = switch (step) {
            case AGENT -> "Set up this agent · which agent is it?";
            case PROJECT -> agent.name() + " · which project does it work on?";
        };
        g.drawString(font, bold(title, x1 - x0 - 160),
                x0, top + 7, Theme.TXT, false);
        String sub = "Step " + (step.ordinal() + 1) + " of 2" + (status.isEmpty() ? "" : "  ·  " + status);
        g.drawString(font, font.plainSubstrByWidth(sub, x1 - x0 - 160), x0, top + 18, Theme.TXT_3, false);

        List<Row> rows = rows();
        int listTop = top + 34;
        int visible = Math.max(1, (bottom - PAD - 20 - listTop) / ROW);
        int textW = x1 - x0 - 80;
        for (int i = scroll; i < Math.min(rows.size(), scroll + visible); i++) {
            Row row = rows.get(i);
            int y = listTop + (i - scroll) * ROW;
            Component name = Component.literal(row.title()).withStyle(s -> s.withBold(true));
            g.drawString(font, name, x0 + 6, y + 3, Theme.TXT, false);
            if (row.meta() != null && !row.meta().isEmpty()) {
                g.drawString(font, font.plainSubstrByWidth("  " + row.meta(), Math.max(0, textW - font.width(name))),
                        x0 + 6 + font.width(name), y + 3, Theme.TXT_4, false);
            }
            if (row.detail() != null) g.drawString(font, font.plainSubstrByWidth(row.detail(), textW), x0 + 6, y + 14, Theme.TXT_3, false);
        }
    }
}
