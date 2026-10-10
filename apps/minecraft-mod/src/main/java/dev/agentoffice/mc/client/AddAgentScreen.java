package dev.agentoffice.mc.client;

import dev.agentoffice.mc.client.ui.FlatButton;
import dev.agentoffice.mc.client.ui.TabletScreen;
import dev.agentoffice.mc.client.ui.Theme;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import java.io.IOException;
import java.util.List;
import java.util.Locale;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.network.chat.Component;

/** Picks an agent definition and adds a seat for it to a project. */
final class AddAgentScreen extends TabletScreen {
    private static final int ROW = 26;

    private final OfficeScreen parent;
    private final AgentOfficeClient client;
    private final Api.Project project;
    private List<Api.Agent> agents = List.of();
    private EditBox filter;
    private String status = "Loading agents…";
    private int scroll;
    private boolean started;
    private boolean adding;

    AddAgentScreen(OfficeScreen parent, AgentOfficeClient client, Api.Project project) {
        super(Component.literal("Add agent"));
        this.parent = parent;
        this.client = client;
        this.project = project;
    }

    @Override
    protected void init() {
        super.init();
        int x0 = left + PAD;
        int x1 = right - PAD;
        // The same box across rebuilds: typing rebuilds the list, and must keep focus and cursor.
        if (filter == null) {
            filter = new EditBox(font, x1 - 150, top + 8, 150, 14, Component.literal("Filter"));
            filter.setHint(Component.literal("Filter agents…").withColor(Theme.TXT_4));
            filter.setResponder(s -> {
                scroll = 0;
                rebuildWidgets();
            });
        }
        filter.setPosition(x1 - 150, top + 8);
        addRenderableWidget(filter);

        List<Api.Agent> shown = shown();
        int listTop = top + 34;
        int visible = Math.max(1, (bottom - PAD - listTop) / ROW);
        scroll = Math.max(0, Math.min(scroll, Math.max(0, shown.size() - visible)));
        for (int i = scroll; i < Math.min(shown.size(), scroll + visible); i++) {
            Api.Agent a = shown.get(i);
            addRenderableWidget(new FlatButton(x1 - 46, listTop + (i - scroll) * ROW + 5, 42, 14, "Add", FlatButton.Kind.PRIMARY,
                    b -> add(a, false))).active = !adding;
        }
        setInitialFocus(filter);
        if (!started) {
            started = true;
            Connection.IO.execute(() -> {
                try {
                    List<Api.Agent> found = client.agents();
                    Minecraft.getInstance().execute(() -> {
                        agents = found;
                        status = found.size() + " agents";
                        rebuildWidgets();
                    });
                } catch (IOException e) {
                    Minecraft.getInstance().execute(() -> status = "Couldn't list agents: " + e.getMessage());
                }
            });
        }
    }

    private List<Api.Agent> shown() {
        String q = filter == null ? "" : filter.getValue().trim().toLowerCase(Locale.ROOT);
        if (q.isEmpty()) return agents;
        return agents.stream().filter(a -> a.name().toLowerCase(Locale.ROOT).contains(q)
                || (a.description() != null && a.description().toLowerCase(Locale.ROOT).contains(q))).toList();
    }

    private void add(Api.Agent agent, boolean force) {
        if (adding) return;
        adding = true;
        status = "Adding " + agent.name() + "…";
        rebuildWidgets();
        Connection.IO.execute(() -> {
            try {
                client.addInstance(project.id(), agent.name(), force);
                Minecraft.getInstance().execute(() -> {
                    // Only if the player is still here: never pull them out of the game.
                    if (Minecraft.getInstance().screen == this) Minecraft.getInstance().setScreen(parent);
                    parent.load();
                });
            } catch (Api.ApiException e) {
                Minecraft.getInstance().execute(() -> {
                    adding = false;
                    // Only the soft cap can be overridden; at the hard cap the server always says no.
                    if ("INSTANCE_CAP_EXCEEDED".equals(e.code) && e.softCap && !force && minecraft.screen == this) {
                        confirmOverCap(agent);
                    } else {
                        status = "Couldn't add: " + e.getMessage();
                        rebuildWidgets();
                    }
                });
            } catch (IOException e) {
                Minecraft.getInstance().execute(() -> {
                    adding = false;
                    status = "Couldn't add: " + e.getMessage();
                    rebuildWidgets();
                });
            }
        });
    }

    private void confirmOverCap(Api.Agent agent) {
        minecraft.setScreen(new ConfirmScreen(yes -> {
            minecraft.setScreen(this);
            if (yes) add(agent, true);
        }, Component.literal(project.name() + " already has a lot of agents"),
                Component.literal("Agent Office suggests keeping fewer seats per project. Add " + agent.name() + " anyway?"),
                Component.literal("Add anyway"), Component.literal("Cancel")));
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
        int visible = Math.max(1, (bottom - PAD - listTop) / ROW);
        List<Api.Agent> shown = shown();
        for (int i = scroll; i < Math.min(shown.size(), scroll + visible); i++) {
            int y = listTop + (i - scroll) * ROW;
            g.fill(left + PAD, y, right - PAD, y + ROW - 2, Theme.CARD_2);
        }
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        int x0 = left + PAD;
        int x1 = right - PAD;
        g.drawString(font, Component.literal("Add an agent to " + project.name()).withStyle(s -> s.withBold(true)), x0, top + 7, Theme.TXT, false);
        g.drawString(font, font.plainSubstrByWidth(status, x1 - x0 - 160), x0, top + 18, Theme.TXT_3, false);
        int listTop = top + 34;
        int visible = Math.max(1, (bottom - PAD - listTop) / ROW);
        List<Api.Agent> shown = shown();
        int textW = x1 - x0 - 60;
        for (int i = scroll; i < Math.min(shown.size(), scroll + visible); i++) {
            Api.Agent a = shown.get(i);
            int y = listTop + (i - scroll) * ROW;
            String meta = (a.defaultModel() == null ? "" : "  ·  " + a.defaultModel()) + (a.defaultEffort() == null ? "" : " · " + a.defaultEffort());
            g.drawString(font, Component.literal(a.name()).withStyle(s -> s.withBold(true)), x0 + 6, y + 3, Theme.TXT, false);
            g.drawString(font, meta, x0 + 6 + font.width(Component.literal(a.name()).withStyle(s -> s.withBold(true))), y + 3, Theme.TXT_4, false);
            String desc = a.description() == null ? "" : a.description();
            g.drawString(font, font.plainSubstrByWidth(desc, textW), x0 + 6, y + 14, Theme.TXT_3, false);
        }
    }

    @Override
    protected GuiEventListener typingTarget() {
        return filter;
    }

    @Override
    public void onClose() {
        minecraft.setScreen(parent);
    }
}
