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
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.network.chat.Component;

/**
 * Setting up an agent shell (placed from an Agent Spawn Egg): which agent is it, which project does
 * it work on, and — if that project already has seats for the agent — which seat. A shell can't be
 * chatted with until this is done; finishing turns it into that seat's body and opens its chat.
 */
final class AgentSetupScreen extends TabletScreen {
    private static final int ROW = 26;

    private enum Step { AGENT, PROJECT, SEAT }

    /** One choice in the current step's list. */
    private record Row(String title, String meta, String detail, String button, Runnable action) {}

    private final AgentOfficeClient client;
    private final String shell;
    private Step step = Step.AGENT;
    private List<Api.Agent> agents = List.of();
    private List<Api.Project> projects = List.of();
    private List<Api.Instance> existing = List.of();
    private Api.Agent agent;
    private Api.Project project;
    private EditBox filter;
    private String status = "Loading agents…";
    private int scroll;
    private boolean busy;
    private boolean started;

    AgentSetupScreen(AgentOfficeClient client, String shell) {
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
        if (step != Step.SEAT) addRenderableWidget(filter);

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
        if (step == Step.SEAT) {
            addRenderableWidget(new FlatButton(x1 - 110, by, 110, 16, "+ New seat", FlatButton.Kind.PRIMARY, b -> createSeat(false))).active = !busy;
        }
        if (step != Step.AGENT) {
            addRenderableWidget(new FlatButton(x0 + 96, by, 60, 16, "Back", FlatButton.Kind.GHOST, b -> back())).active = !busy;
        }
        if (step != Step.SEAT) setInitialFocus(filter);

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
                        rebuildWidgets();
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
            case SEAT -> {
                for (Api.Instance seat : existing) {
                    Api.Slot slot = seat.slot();
                    boolean placed = Bodies.placed(Minecraft.getInstance(), slot);
                    out.add(new Row(slot.displayName(), slot.instanceId(),
                            placed ? "Already has a body in this world — it moves here." : null, "Use", () -> finish(slot)));
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

    /** A project that already seats this agent offers those seats; otherwise a new seat is made. */
    private void chooseProject(Api.Project p) {
        project = p;
        busy = true;
        status = "Checking " + p.name() + "…";
        rebuildWidgets();
        Api.Agent chosen = agent;
        Connection.IO.execute(() -> {
            List<Api.Instance> seats;
            try {
                seats = seatsOf(p, chosen);
            } catch (IOException | RuntimeException e) {
                Minecraft.getInstance().execute(() -> {
                    busy = false;
                    status = "Couldn't read " + p.name() + ": " + e.getMessage();
                    if (minecraft.screen == this) rebuildWidgets();
                });
                return;
            }
            Minecraft.getInstance().execute(() -> {
                busy = false;
                // Left, went back or picked something else meanwhile: never create a seat on a stale choice.
                if (minecraft.screen != this || step != Step.PROJECT || project != p || agent != chosen) return;
                if (seats.isEmpty()) {
                    createSeat(false);
                    return;
                }
                showSeats(seats, "");
            });
        });
    }

    private List<Api.Instance> seatsOf(Api.Project p, Api.Agent a) throws IOException {
        return client.instances(p).stream().filter(i -> a.name().equals(i.slot().agentId())).toList();
    }

    private void showSeats(List<Api.Instance> seats, String message) {
        existing = seats;
        step = Step.SEAT;
        status = message;
        scroll = 0;
        rebuildWidgets();
    }

    private void createSeat(boolean force) {
        if (busy && !force) return;
        busy = true;
        status = "Adding " + agent.name() + " to " + project.name() + "… (making a git worktree can take a while)";
        rebuildWidgets();
        Api.Project p = project;
        Api.Agent a = agent;
        Connection.IO.execute(() -> {
            try {
                String instanceId = client.addInstance(p.id(), a.name(), force);
                Api.Slot slot = new Api.Slot(p.id(), p.name(), a.name(), instanceId, null);
                Minecraft.getInstance().execute(() -> finish(slot));
            } catch (Api.ApiException e) {
                Minecraft.getInstance().execute(() -> {
                    busy = false;
                    // Only the soft cap can be overridden; at the hard cap the server always says no.
                    if ("INSTANCE_CAP_EXCEEDED".equals(e.code) && e.softCap && !force && minecraft.screen == this) {
                        confirmOverCap();
                    } else {
                        status = "INSTANCE_CAP_EXCEEDED".equals(e.code)
                                ? p.name() + " has as many agents as Agent Office allows. Remove one first, or use an existing seat."
                                : "Couldn't add the seat: " + e.getMessage();
                        if (minecraft.screen == this) rebuildWidgets();
                    }
                });
            } catch (IOException | RuntimeException e) {
                // Maybe a timeout while the server still made the seat: show what exists instead of inviting a
                // second "+ New seat" that would make a second one.
                List<Api.Instance> seats;
                try {
                    seats = seatsOf(p, a);
                } catch (IOException | RuntimeException again) {
                    seats = null;
                }
                List<Api.Instance> found = seats;
                Minecraft.getInstance().execute(() -> {
                    busy = false;
                    if (minecraft.screen != this) return;
                    if (found != null && !found.isEmpty()) {
                        showSeats(found, "Adding didn't confirm (" + e.getMessage() + "). If it went through, the seat is listed here.");
                    } else {
                        status = "Couldn't add the seat: " + e.getMessage();
                        rebuildWidgets();
                    }
                });
            }
        });
    }

    private void confirmOverCap() {
        minecraft.setScreen(new ConfirmScreen(yes -> {
            minecraft.setScreen(this);
            if (yes) createSeat(true);
        }, Component.literal(project.name() + " already has a lot of agents"),
                Component.literal("Agent Office suggests keeping fewer seats per project. Add " + agent.name() + " anyway?"),
                Component.literal("Add anyway"), Component.literal("Cancel")));
    }

    /**
     * The shell becomes this seat's body; then its chat opens. A seat made after the player left this
     * screen still exists in Agent Office, so they are told either way.
     */
    private void finish(Api.Slot slot) {
        Minecraft mc = Minecraft.getInstance();
        busy = false;
        boolean here = mc.screen == this;
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
        if (here) mc.setScreen(new ChatScreen(null, client, slot));
        else mc.gui.setOverlayMessage(Component.literal("Set up " + slot.agentId() + " in " + slot.projectName()), false);
    }

    private void back() {
        step = step == Step.SEAT ? Step.PROJECT : Step.AGENT;
        status = "";
        filter.setValue("");
        scroll = 0;
        rebuildWidgets();
    }

    @Override
    protected GuiEventListener typingTarget() {
        return step == Step.SEAT ? null : filter;
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
            case SEAT -> project.name() + " already has " + agent.name() + " — use a seat or add one";
        };
        g.drawString(font, bold(title, x1 - x0 - 160),
                x0, top + 7, Theme.TXT, false);
        String sub = "Step " + (step.ordinal() + 1) + (step == Step.SEAT ? " of 3" : " of 2–3") + (status.isEmpty() ? "" : "  ·  " + status);
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
