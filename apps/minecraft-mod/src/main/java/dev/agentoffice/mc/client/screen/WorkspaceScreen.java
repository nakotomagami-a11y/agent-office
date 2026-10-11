package dev.agentoffice.mc.client.screen;

import com.mojang.blaze3d.systems.RenderSystem;
import dev.agentoffice.mc.client.service.AgentStatus;
import dev.agentoffice.mc.client.service.Bodies;
import dev.agentoffice.mc.client.service.SeatAdder;
import dev.agentoffice.mc.client.service.WorkspaceStore;
import dev.agentoffice.mc.client.ui.FlatButton;
import dev.agentoffice.mc.client.ui.TabletScreen;
import dev.agentoffice.mc.client.ui.Theme;
import dev.agentoffice.mc.core.AgentNames;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.ObjectSelectionList;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.FormattedCharSequence;

/**
 * The tablet laid out like Agent Office's window: the desktop app's open projects as tabs on the
 * window's top edge (vanilla's advancement tabs), the project's roster (each agent and its sessions, a
 * vanilla selection list in a well) on the left, the screen's own content (a chat) in the rest. What it shows of
 * the office is {@link WorkspaceStore}'s, shared by every workspace screen; agents' statuses are {@link AgentStatus}'s.
 */
public abstract class WorkspaceScreen extends TabletScreen {
    /** The sidebar takes a fifth of the screen, within these. */
    private static final int MIN_SIDEBAR = 120;
    private static final int MAX_SIDEBAR = 160;
    /** Narrower than this (scaled GUI width) and the sidebar would crush the chat: it goes. */
    private static final int MIN_WIDTH_FOR_SIDEBAR = 540;
    /** Room above the window for the tabs: vanilla's advancement tab is 28 above the edge (32 selected). */
    private static final int TABS = 28;
    private static final int TAB_GAP = 2;
    private static final int ROW = 18;
    private static final int MIN_TAB = 60;
    private static final int MAX_TAB = 130;
    private static final ResourceLocation TAB_FIRST = ResourceLocation.withDefaultNamespace("advancements/tab_above_left");
    private static final ResourceLocation TAB_FIRST_SELECTED = ResourceLocation.withDefaultNamespace("advancements/tab_above_left_selected");
    private static final ResourceLocation TAB = ResourceLocation.withDefaultNamespace("advancements/tab_above_middle");
    private static final ResourceLocation TAB_SELECTED = ResourceLocation.withDefaultNamespace("advancements/tab_above_middle_selected");
    private static final int REFRESH_TICKS = 100;

    private sealed interface Entry permits Group, Session, Add {}

    private record Group(String agentId, int count) implements Entry {}

    private record Session(Api.Slot slot, int n) implements Entry {}

    private record Add(String agentId) implements Entry {}

    private int wsTicks;
    private Roster roster;
    private String rosterProject;
    private List<FormattedCharSequence> noteLines = List.of();

    protected WorkspaceScreen(Component title) {
        super(title);
    }

    /** The project shown; null until one is known. */
    protected abstract String projectId();

    /** The session this screen is about, highlighted in the roster; null for none. */
    protected Api.Slot activeSlot() {
        return null;
    }

    @Override
    protected int sidebarWidth() {
        return width < MIN_WIDTH_FOR_SIDEBAR ? 0 : Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, width / 5 / 2 * 2));
    }

    @Override
    protected int tabsHeight() {
        return TABS;
    }

    /** The tablet opens where it was left: the last chat, else its project, else the first tab. */
    public static void openHome(Minecraft mc) {
        String project = WorkspaceStore.lastProject();
        Api.Slot last = project == null ? null : WorkspaceStore.lastSlot(project);
        AgentOfficeClient client = WorkspaceStore.client();
        mc.setScreen(last != null && client != null ? new ChatScreen(null, client, last) : new ProjectScreen(project));
    }

    /** That session's chat. {@code moveBody}: the agent's body in this world talks to it from now on. */
    static void openSlot(Api.Slot slot, boolean moveBody) {
        Minecraft mc = Minecraft.getInstance();
        AgentOfficeClient c = WorkspaceStore.client();
        if (c == null) return;
        if (moveBody) {
            Api.Slot standing = Bodies.seatOf(mc, slot);
            if (standing != null && !standing.instanceId().equals(slot.instanceId())) Bodies.switchSeat(mc, slot);
        }
        if (mc.screen instanceof WorkspaceScreen ws && ws.activeSlot() != null
                && ws.activeSlot().instanceId().equals(slot.instanceId())) {
            ws.rebuildWidgets(); // already open: keep its draft, show where the body is now
            return;
        }
        mc.setScreen(new ChatScreen(null, c, slot));
    }

    /** "Session N" by roster order, as Agent Office shows it, unless the session has a label. */
    static String sessionName(Api.Slot slot) {
        if (slot.label() != null && !slot.label().isBlank()) return slot.label();
        List<Api.Instance> roster = WorkspaceStore.roster(slot.projectId());
        if (roster != null) {
            int n = 0;
            for (Api.Instance i : roster) {
                if (!i.slot().agentId().equals(slot.agentId())) continue;
                n++;
                if (i.slot().instanceId().equals(slot.instanceId())) return "Session " + n;
            }
        }
        return slot.instanceId();
    }

    @Override
    protected void init() {
        saveScroll();
        super.init();
        String current = projectId();
        Api.Slot active = activeSlot();
        if (active != null) WorkspaceStore.opened(active);
        else if (current != null) WorkspaceStore.openedProject(current);
        WorkspaceStore.refreshIfStale(current, outcome -> refreshed(current, outcome));
        List<Api.Instance> shownRoster = WorkspaceStore.roster(current);
        AgentStatus.watch(this, shownRoster == null ? List.of() : shownRoster.stream().map(Api.Instance::slot).toList());

        boolean narrow = sidebarWidth() == 0;
        int manageW = font.width("Manage") + 16;
        addTabs(current, narrow ? manageW + 4 + (panelRight - right) : 0);
        if (narrow) {
            // No sidebar: the old screen still lists every session (Chat) and manages agents.
            addRenderableWidget(new FlatButton(right - manageW, panelTop - 24, manageW, 20, "Manage", FlatButton.Kind.NORMAL,
                    b -> minecraft.setScreen(new OfficeScreen())));
            return;
        }

        int sw = sidebarWidth();
        String note = WorkspaceStore.addNote() != null ? WorkspaceStore.addNote() : WorkspaceStore.problem();
        noteLines = note == null ? List.of() : font.split(Component.literal(note), sw - 12);
        int listBottom = bottom - 26 - (noteLines.isEmpty() ? 0 : noteLines.size() * 10 + 4);
        // Inside the roster's well (1-px bevel), which ends 6 short of the chat column.
        roster = new Roster(sw - 8, listBottom - top - 2, top + 1);
        roster.setX(frameLeft + 1);
        Map<String, Api.Slot> bodies = new HashMap<>();
        for (Entry e : entries(current)) {
            switch (e) {
                case Group g -> roster.add(new GroupRow(current + "/" + g.agentId(), g));
                case Session s -> {
                    Api.Slot body = bodies.computeIfAbsent(s.slot().agentId(), k -> Bodies.seatOf(minecraft, s.slot()));
                    SessionRow row = new SessionRow(s.slot(), body != null && body.instanceId().equals(s.slot().instanceId()));
                    roster.add(row);
                    if (active != null && active.instanceId().equals(s.slot().instanceId())) {
                        roster.shown = row;
                        roster.setSelected(row);
                    }
                }
                case Add a -> roster.add(new AddRow(current, a.agentId()));
            }
        }
        rosterProject = current;
        roster.setScrollAmount(WorkspaceStore.scroll(current));
        addRenderableWidget(roster);
        addRenderableWidget(new FlatButton(frameLeft, bottom - 20, sw - 6, 20, "Manage agents", FlatButton.Kind.NORMAL,
                b -> minecraft.setScreen(new OfficeScreen())));
    }

    private void saveScroll() {
        if (roster != null && rosterProject != null) WorkspaceStore.scroll(rosterProject, roster.getScrollAmount());
    }

    @Override
    protected void onRemoved() {
        saveScroll();
        AgentStatus.unwatch(this);
    }

    /** Every tab shrinks before any is dropped, and the shown project's tab is never the one dropped. */
    private void addTabs(String current, int reserved) {
        List<Api.Project> tabs = WorkspaceStore.tabProjects(current);
        int x0 = panelLeft;
        // Clear of the panel's rounded top-right corner (unless Manage already sits there).
        int avail = panelRight - (reserved == 0 ? 4 : 0) - x0 - reserved;
        while (tabs.size() > 1 && tabs.size() * (MIN_TAB + TAB_GAP) > avail) {
            int drop = tabs.size() - 1;
            if (tabs.get(drop).id().equals(current)) drop--;
            tabs.remove(drop);
        }
        int tx = x0;
        for (Api.Project p : tabs) {
            int w = Math.max(MIN_TAB, Math.min(MAX_TAB, font.width(p.name()) + 20));
            w = Math.min(w, Math.max(MIN_TAB, avail / tabs.size() - TAB_GAP));
            addRenderableWidget(new Tab(tx, panelTop - TABS, w, TABS, p.name(), p.id().equals(current), tx == x0, b -> openProject(p.id())));
            tx += w + TAB_GAP;
        }
    }

    static String firstTab() {
        List<Api.Project> tabs = WorkspaceStore.tabProjects(null);
        return tabs.isEmpty() ? null : tabs.get(0).id();
    }

    /** For a screen with nothing open yet: why the workspace is empty, or null when it isn't. */
    static String emptyReason() {
        if (WorkspaceStore.problem() != null) return WorkspaceStore.problem();
        if (WorkspaceStore.client() == null || WorkspaceStore.loading() && WorkspaceStore.projects().isEmpty()) return "Connecting to Agent Office…";
        return WorkspaceStore.projects().isEmpty() ? "No projects in Agent Office yet." : null;
    }

    private static List<Entry> entries(String projectId) {
        List<Entry> out = new ArrayList<>();
        List<Api.Instance> roster = WorkspaceStore.roster(projectId);
        if (roster == null) return out;
        Map<String, List<Api.Slot>> byAgent = new LinkedHashMap<>();
        for (Api.Instance i : roster) byAgent.computeIfAbsent(i.slot().agentId(), k -> new ArrayList<>()).add(i.slot());
        byAgent.forEach((agent, slots) -> {
            out.add(new Group(agent, slots.size()));
            if (WorkspaceStore.collapsed(projectId + "/" + agent)) return;
            for (int n = 0; n < slots.size(); n++) out.add(new Session(slots.get(n), n + 1));
            out.add(new Add(agent));
        });
        return out;
    }

    /** A tab click never moves a body: only picking a session does. */
    private void openProject(String id) {
        List<Api.Instance> roster = WorkspaceStore.roster(id);
        Api.Slot last = WorkspaceStore.lastSlot(id);
        if (last == null && roster != null && !roster.isEmpty()) last = roster.get(0).slot();
        if (last != null && WorkspaceStore.client() != null) {
            openSlot(last, false);
            return;
        }
        WorkspaceStore.openedProject(id);
        if (!id.equals(projectId())) minecraft.setScreen(new ProjectScreen(id));
    }

    private void addSession(String projectId, String agentId) {
        Api.Project project = WorkspaceStore.project(projectId);
        AgentOfficeClient client = WorkspaceStore.client();
        if (project == null || client == null || WorkspaceStore.adding()) return;
        WorkspaceStore.addStarted(agentId);
        rebuildWidgets();
        SeatAdder.add(this, client, project, agentId, slot -> {
            WorkspaceStore.added();
            refresh(projectId, false);
            Minecraft mc = Minecraft.getInstance();
            if (mc.screen == this) openSlot(slot, true);
            else mc.gui.setOverlayMessage(Component.literal("Added a " + AgentNames.of(agentId) + " session to " + project.name()), false);
        }, msg -> {
            WorkspaceStore.addFailed(msg);
            Minecraft mc = Minecraft.getInstance();
            if (mc.screen instanceof WorkspaceScreen ws) ws.rebuildWidgets();
            else mc.gui.setOverlayMessage(Component.literal(msg), false);
        });
    }

    private static void refresh(String focus, boolean full) {
        WorkspaceStore.refresh(focus, full, outcome -> refreshed(focus, outcome));
    }

    /** A refresh landed: whatever workspace screen is up shows it, and one that is out of date already goes again. */
    private static void refreshed(String focus, WorkspaceStore.Outcome outcome) {
        if (!(Minecraft.getInstance().screen instanceof WorkspaceScreen ws)) return;
        String shown = ws.projectId();
        if (outcome.superseded() || shown != null && !shown.equals(focus)) refresh(shown, false);
        if (outcome.changed()) ws.rebuildWidgets();
    }

    @Override
    public void tick() {
        super.tick();
        if (++wsTicks % REFRESH_TICKS == 0) refresh(projectId(), WorkspaceStore.fullDue());
        if (WorkspaceStore.expireNote()) rebuildWidgets();
    }

    /** The roster's well; the screen's own content draws the rest. */
    @Override
    protected void renderWells(GuiGraphics g) {
        if (sidebarWidth() > 0 && roster != null) well(g, frameLeft, top, sidebarWidth() - 6, roster.getBottom() + 1 - top);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        if (sidebarWidth() == 0) return;
        int x = frameLeft + 6;
        String current = projectId();
        List<Api.Instance> shownRoster = WorkspaceStore.roster(current);
        if (shownRoster != null && shownRoster.isEmpty()) {
            g.drawString(font, "No agents yet", x + 2, top + 8, Theme.TXT_3);
        }
        int y = bottom - 24 - noteLines.size() * 10;
        for (FormattedCharSequence line : noteLines) {
            g.drawString(font, line, frameLeft, y, PANEL_TEXT, false);
            y += 10;
        }
    }

    /** {@code text} cut to {@code width} with an ellipsis. */
    static String cut(Font font, String text, int width) {
        if (font.width(text) <= width) return text;
        return font.plainSubstrByWidth(text, Math.max(0, width - font.width("…"))) + "…";
    }

    /**
     * A project tab as vanilla's advancement tabs, on the window's top edge (the first one joins its left
     * edge): the 28-wide sprite cut into its edges and a repeated middle, so a project name fits.
     */
    private static final class Tab extends Button {
        private final boolean selected;
        private final boolean first;

        Tab(int x, int y, int w, int h, String label, boolean selected, boolean first, OnPress onPress) {
            super(x, y, w, h, Component.literal(label), onPress, DEFAULT_NARRATION);
            this.selected = selected;
            this.first = first;
        }

        @Override
        protected void renderWidget(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
            ResourceLocation sprite = first ? (selected ? TAB_FIRST_SELECTED : TAB_FIRST) : (selected ? TAB_SELECTED : TAB);
            int x = getX();
            int y = getY();
            RenderSystem.enableBlend();
            g.blitSprite(sprite, 28, 32, 0, 0, x, y, 4, 32);
            for (int cx = x + 4; cx < x + width - 4; cx += 20) g.blitSprite(sprite, 28, 32, 4, 0, cx, y, Math.min(20, x + width - 4 - cx), 32);
            g.blitSprite(sprite, 28, 32, 24, 0, x + width - 4, y, 4, 32);
            RenderSystem.disableBlend();
            Font font = Minecraft.getInstance().font;
            String label = cut(font, getMessage().getString(), width - 12);
            int tx = x + (width - font.width(label)) / 2;
            if (selected) {
                g.drawString(font, label, tx, y + 11, PANEL_TEXT, false);
            } else {
                g.drawString(font, label, tx, y + 13, isHoveredOrFocused() ? 0xFFFFA0 : 0xFFFFFF);
            }
        }
    }

    private final class Roster extends ObjectSelectionList<Row> {
        /** The open session's row. */
        private Row shown;

        Roster(int w, int h, int y) {
            super(Minecraft.getInstance(), w, h, y, ROW);
        }

        /** The selection box marks the open session only; a click that opens nothing must not move it. */
        @Override
        public void setSelected(Row row) {
            if (row == null || row == shown) super.setSelected(row);
        }

        void add(Row row) {
            addEntry(row);
        }

        @Override
        public int getRowWidth() {
            return width - 14;
        }

        @Override
        protected int getScrollbarPosition() {
            return getRight() - 6;
        }

        /** The well behind it is the background; no menu list texture or separators. */
        @Override
        protected void renderListBackground(GuiGraphics g) {}

        @Override
        protected void renderListSeparators(GuiGraphics g) {}
    }

    private abstract static class Row extends ObjectSelectionList.Entry<Row> {
        abstract String label();

        @Override
        public Component getNarration() {
            return Component.literal(label());
        }
    }

    /** An agent: click to fold its sessions away. */
    private final class GroupRow extends Row {
        private final String key;
        private final Group group;

        GroupRow(String key, Group group) {
            this.key = key;
            this.group = group;
        }

        @Override
        String label() {
            return group.agentId();
        }

        @Override
        public void render(GuiGraphics g, int index, int top, int left, int width, int height, int mouseX, int mouseY,
                           boolean hovering, float partialTick) {
            int y = top + (height - 8) / 2;
            g.drawString(font, WorkspaceStore.collapsed(key) ? "▸" : "▾", left, y, Theme.TXT_4);
            String count = String.valueOf(group.count());
            int countX = left + width - 2 - font.width(count);
            g.drawString(font, count, countX, y, Theme.TXT_4);
            g.drawString(font, cut(font, AgentNames.of(group.agentId()), countX - left - 14), left + 8, y, hovering ? Theme.HOVER : Theme.TXT);
        }

        @Override
        public boolean mouseClicked(double mouseX, double mouseY, int button) {
            WorkspaceStore.toggleCollapsed(key);
            rebuildWidgets();
            return true;
        }
    }

    /** One session: its status dot and name; the one shown is the list's selection. */
    private final class SessionRow extends Row {
        private final Api.Slot slot;
        private final boolean hasBody;

        SessionRow(Api.Slot slot, boolean hasBody) {
            this.slot = slot;
            this.hasBody = hasBody;
        }

        @Override
        String label() {
            return sessionName(slot);
        }

        @Override
        public void render(GuiGraphics g, int index, int top, int left, int width, int height, int mouseX, int mouseY,
                           boolean hovering, float partialTick) {
            g.blitSprite(Theme.dot(AgentStatus.of(slot)), left + 8, top + (height - 6) / 2, 6, 6);
            int y = top + (height - 8) / 2;
            int end = left + width - 2;
            if (hasBody) {
                end -= font.width("⌂");
                g.drawString(font, "⌂", end, y, Theme.TXT_4);
                end -= 4;
            }
            boolean on = roster != null && roster.getSelected() == this;
            g.drawString(font, cut(font, label(), end - left - 18), left + 18, y, on || hovering ? Theme.HOVER : Theme.TXT_2);
        }

        @Override
        public boolean mouseClicked(double mouseX, double mouseY, int button) {
            openSlot(slot, true);
            return true;
        }
    }

    private final class AddRow extends Row {
        private final String projectId;
        private final String agentId;

        AddRow(String projectId, String agentId) {
            this.projectId = projectId;
            this.agentId = agentId;
        }

        @Override
        String label() {
            return WorkspaceStore.adding() ? "Adding…" : "+ New session";
        }

        @Override
        public void render(GuiGraphics g, int index, int top, int left, int width, int height, int mouseX, int mouseY,
                           boolean hovering, float partialTick) {
            int color = WorkspaceStore.adding() ? Theme.TXT_4 : hovering ? Theme.HOVER : Theme.TXT_3;
            g.drawString(font, label(), left + 18, top + (height - 8) / 2, color);
        }

        @Override
        public boolean mouseClicked(double mouseX, double mouseY, int button) {
            addSession(projectId, agentId);
            return true;
        }
    }
}
