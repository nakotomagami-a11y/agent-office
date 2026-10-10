package dev.agentoffice.mc.client;

import dev.agentoffice.mc.client.ui.FlatButton;
import dev.agentoffice.mc.client.ui.TabletScreen;
import dev.agentoffice.mc.client.ui.Theme;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

/**
 * The tablet laid out like Agent Office's window: the desktop app's open projects as tabs along the
 * top, the project's roster (each agent and its sessions) on the left, the screen's own content (a
 * chat) in the rest. What it knows of the office is shared by every workspace screen (main thread
 * only), so moving between sessions never starts from an empty sidebar.
 */
abstract class WorkspaceScreen extends TabletScreen {
    private static final int SIDEBAR = 112;
    /** Narrower than this (scaled GUI width) and the sidebar would crush the chat: it goes. */
    private static final int MIN_WIDTH_FOR_SIDEBAR = 420;
    private static final int TABS = 22;
    private static final int ROW = 15;
    private static final int MIN_TAB = 44;
    private static final int REFRESH_TICKS = 100;
    private static final long STALE_MS = 4_000;
    /** Projects, the app's tabs and every tab's roster; the shown project is polled more often. */
    private static final long FULL_STALE_MS = 30_000;

    private static AgentOfficeClient client;
    private static List<Api.Project> projects = List.of();
    private static List<String> openTabs = List.of();
    private static final Map<String, List<Api.Instance>> rosters = new HashMap<>();
    private static final Map<String, String> statuses = new HashMap<>();
    private static final Map<String, Api.Slot> lastSlot = new HashMap<>();
    private static final Set<String> collapsed = new HashSet<>();
    private static final Map<String, Integer> scrolls = new HashMap<>();
    private static String lastProject;
    private static String problem;
    /** What "+ New session" is doing or why it failed; refreshes leave it alone. */
    private static String addNote;
    private static boolean adding;
    private static long loadedAt;
    private static long fullLoadedAt;
    private static boolean loading;
    /** Bumped when what is loaded is known to be out of date (a session added). */
    private static int generation;

    private sealed interface Entry permits Group, Session, Add {}

    private record Group(String agentId, int count) implements Entry {}

    private record Session(Api.Slot slot, int n) implements Entry {}

    private record Add(String agentId) implements Entry {}

    private record Loaded(AgentOfficeClient client, List<Api.Project> projects, List<String> tabs,
                          Map<String, List<Api.Instance>> rosters, Map<String, String> statuses) {}

    private int wsTicks;
    private final Map<Integer, Api.Slot> sessionRows = new HashMap<>();
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
        return width < MIN_WIDTH_FOR_SIDEBAR ? 0 : SIDEBAR;
    }

    @Override
    protected int tabsHeight() {
        return TABS;
    }

    /** The tablet opens where it was left: the last chat, else its project, else the first tab. */
    static void openHome(Minecraft mc) {
        Api.Slot last = lastProject == null ? null : remembered(lastProject);
        mc.setScreen(last != null && client != null ? new ChatScreen(null, client, last) : new ProjectScreen(lastProject));
    }

    /** The last chat in that project, unless its session was removed since. */
    private static Api.Slot remembered(String projectId) {
        Api.Slot last = lastSlot.get(projectId);
        List<Api.Instance> roster = rosters.get(projectId);
        if (last != null && roster != null && roster.stream().noneMatch(i -> i.slot().instanceId().equals(last.instanceId()))) {
            lastSlot.remove(projectId);
            return null;
        }
        return last;
    }

    /** That session's chat. {@code moveBody}: the agent's body in this world talks to it from now on. */
    static void openSlot(Api.Slot slot, boolean moveBody) {
        Minecraft mc = Minecraft.getInstance();
        AgentOfficeClient c = client;
        if (c == null) return;
        if (mc.screen instanceof WorkspaceScreen ws && ws.activeSlot() != null
                && ws.activeSlot().instanceId().equals(slot.instanceId())) return; // already open: keep its draft
        if (moveBody) {
            Api.Slot standing = Bodies.seatOf(mc, slot);
            if (standing != null && !standing.instanceId().equals(slot.instanceId())) Bodies.switchSeat(mc, slot);
        }
        mc.setScreen(new ChatScreen(null, c, slot));
    }

    /** "Session N" by roster order, as Agent Office shows it, unless the session has a label. */
    static String sessionName(Api.Slot slot) {
        if (slot.label() != null && !slot.label().isBlank()) return slot.label();
        List<Api.Instance> roster = rosters.get(slot.projectId());
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
        super.init();
        String current = projectId();
        Api.Slot active = activeSlot();
        if (active != null) {
            lastSlot.put(active.projectId(), active);
            lastProject = active.projectId();
        } else if (current != null) {
            lastProject = current;
        }
        long age = System.currentTimeMillis() - loadedAt;
        if (System.currentTimeMillis() - fullLoadedAt > FULL_STALE_MS) refresh(current, true);
        else if (age > STALE_MS) refresh(current, false);

        addTabs(current);
        if (sidebarWidth() == 0) return;

        String note = addNote != null ? addNote : problem;
        noteLines = note == null ? List.of() : font.split(Component.literal(note), SIDEBAR - 12);
        sessionRows.clear();
        List<Entry> entries = entries(current);
        int x = frameLeft + 4;
        int w = SIDEBAR - 8;
        int y0 = top + 18;
        int rowsBottom = bottom - 24 - noteLines.size() * 10;
        int visible = Math.max(1, (rowsBottom - y0) / ROW);
        int scroll = Math.max(0, Math.min(scrolls.getOrDefault(current, 0), Math.max(0, entries.size() - visible)));
        scrolls.put(current, scroll);
        Api.Slot body = active != null ? Bodies.seatOf(Minecraft.getInstance(), active) : null;
        for (int i = scroll; i < Math.min(entries.size(), scroll + visible); i++) {
            int y = y0 + (i - scroll) * ROW;
            Entry e = entries.get(i);
            if (e instanceof Group g) {
                String key = current + "/" + g.agentId();
                boolean shut = collapsed.contains(key);
                addRenderableWidget(new FlatButton(x, y, w, ROW - 2, (shut ? "▸ " : "▾ ") + g.agentId() + "  " + g.count(),
                        FlatButton.Kind.GHOST, b -> {
                            if (!collapsed.remove(key)) collapsed.add(key);
                            rebuildWidgets();
                        }).alignLeft());
            } else if (e instanceof Session s) {
                boolean on = active != null && active.instanceId().equals(s.slot().instanceId());
                boolean hasBody = body != null && body.instanceId().equals(s.slot().instanceId());
                addRenderableWidget(new FlatButton(x + 8, y, w - 8, ROW - 2, sessionName(s.slot()) + (hasBody ? " ⌂" : ""),
                        on ? FlatButton.Kind.NORMAL : FlatButton.Kind.GHOST, b -> openSlot(s.slot(), true)).alignLeft());
                sessionRows.put(y, s.slot());
            } else if (e instanceof Add a) {
                addRenderableWidget(new FlatButton(x + 8, y, w - 8, ROW - 2, adding ? "Adding…" : "+ New session", FlatButton.Kind.GHOST,
                        b -> addSession(current, a.agentId())).alignLeft()).active = !adding;
            }
        }
        addRenderableWidget(new FlatButton(x, bottom - 20, w, 16, "Manage agents", FlatButton.Kind.GHOST,
                b -> minecraft.setScreen(new OfficeScreen())));
    }

    /** Every tab shrinks before any is dropped, and the shown project's tab is never the one dropped. */
    private void addTabs(String current) {
        List<Api.Project> tabs = tabProjects(current);
        int avail = right - PAD - (frameLeft + PAD);
        while (tabs.size() > 1 && tabs.size() * (MIN_TAB + 4) > avail) {
            int drop = tabs.size() - 1;
            if (tabs.get(drop).id().equals(current)) drop--;
            tabs.remove(drop);
        }
        int each = tabs.isEmpty() ? 0 : Math.min(120, avail / tabs.size() - 4);
        int tx = frameLeft + PAD;
        for (Api.Project p : tabs) {
            int w = Math.max(MIN_TAB, Math.min(each, font.width(p.name()) + 16));
            String label = font.width(p.name()) + 12 > w ? font.plainSubstrByWidth(p.name(), w - 16) + "…" : p.name();
            addRenderableWidget(new FlatButton(tx, frameTop + 4, w, 14, label,
                    p.id().equals(current) ? FlatButton.Kind.NORMAL : FlatButton.Kind.GHOST, b -> openProject(p.id())));
            tx += w + 4;
        }
    }

    /** The desktop app's open tabs; all projects when it has none. The shown project is always a tab. */
    private static List<Api.Project> tabProjects(String current) {
        List<Api.Project> out = new ArrayList<>();
        for (String id : openTabs) {
            for (Api.Project p : projects) if (p.id().equals(id)) out.add(p);
        }
        if (out.isEmpty()) out.addAll(projects);
        if (current != null && out.stream().noneMatch(p -> p.id().equals(current))) {
            projects.stream().filter(p -> p.id().equals(current)).findFirst().ifPresent(out::add);
        }
        return out;
    }

    static String firstTab() {
        List<Api.Project> tabs = tabProjects(null);
        return tabs.isEmpty() ? null : tabs.get(0).id();
    }

    /** For a screen with nothing open yet: why the workspace is empty, or null when it isn't. */
    static String emptyReason() {
        if (problem != null) return problem;
        if (client == null || loading && projects.isEmpty()) return "Connecting to Agent Office…";
        return projects.isEmpty() ? "No projects in Agent Office yet." : null;
    }

    private static List<Entry> entries(String projectId) {
        List<Entry> out = new ArrayList<>();
        List<Api.Instance> roster = projectId == null ? null : rosters.get(projectId);
        if (roster == null) return out;
        Map<String, List<Api.Slot>> byAgent = new LinkedHashMap<>();
        for (Api.Instance i : roster) byAgent.computeIfAbsent(i.slot().agentId(), k -> new ArrayList<>()).add(i.slot());
        byAgent.forEach((agent, slots) -> {
            out.add(new Group(agent, slots.size()));
            if (collapsed.contains(projectId + "/" + agent)) return;
            for (int n = 0; n < slots.size(); n++) out.add(new Session(slots.get(n), n + 1));
            out.add(new Add(agent));
        });
        return out;
    }

    /** A tab click never moves a body: only picking a session does. */
    private void openProject(String id) {
        List<Api.Instance> roster = rosters.get(id);
        Api.Slot last = remembered(id);
        if (last == null && roster != null && !roster.isEmpty()) last = roster.get(0).slot();
        if (last != null && client != null) {
            openSlot(last, false);
            return;
        }
        lastProject = id;
        if (!id.equals(projectId())) minecraft.setScreen(new ProjectScreen(id));
    }

    private void addSession(String projectId, String agentId) {
        Api.Project project = projects.stream().filter(p -> p.id().equals(projectId)).findFirst().orElse(null);
        if (project == null || client == null || adding) return;
        adding = true;
        addNote = "Adding a " + agentId + " session… (making a git worktree can take a while)";
        rebuildWidgets();
        SeatAdder.add(this, client, project, agentId, slot -> {
            adding = false;
            addNote = null;
            generation++;
            refresh(projectId, false);
            Minecraft mc = Minecraft.getInstance();
            if (mc.screen == this) openSlot(slot, true);
            else mc.gui.setOverlayMessage(Component.literal("Added a " + agentId + " session to " + project.name()), false);
        }, msg -> {
            adding = false;
            addNote = msg;
            Minecraft mc = Minecraft.getInstance();
            if (mc.screen instanceof WorkspaceScreen ws) ws.rebuildWidgets();
            else mc.gui.setOverlayMessage(Component.literal(msg), false);
        });
    }

    /**
     * The shown project's roster and session statuses; with {@code full}, also the projects, the app's
     * tabs and every tab's roster. A project that fails to load keeps what was known of it.
     */
    private static void refresh(String focus, boolean full) {
        if (loading) return;
        loading = true;
        int gen = generation;
        Connection.client().thenApplyAsync(c -> {
            try {
                List<Api.Project> ps = full || projects.isEmpty() ? c.projects() : projects;
                List<String> tabs = openTabs;
                if (full) {
                    try {
                        tabs = c.openTabs();
                    } catch (IOException e) {
                        tabs = List.of(); // an older app without the setting: every project is a tab
                    }
                }
                Map<String, List<Api.Instance>> rs = new HashMap<>();
                for (Api.Project p : ps) {
                    boolean wanted = p.id().equals(focus) || full && (tabs.isEmpty() || tabs.contains(p.id()));
                    if (!wanted) continue;
                    try {
                        rs.put(p.id(), c.instances(p));
                    } catch (IOException | RuntimeException e) {
                        // keep what was known of this one
                    }
                }
                Map<String, String> st = new HashMap<>();
                for (Api.Instance i : rs.getOrDefault(focus, List.of())) {
                    try {
                        st.put(i.slot().instanceId(), c.current(i.slot()).map(Api.Conversation::status).orElse("idle"));
                    } catch (IOException | RuntimeException e) {
                        st.put(i.slot().instanceId(), "unknown");
                    }
                }
                return new Loaded(c, ps, tabs, rs, st);
            } catch (IOException e) {
                throw new IllegalStateException(e);
            }
        }, Connection.IO).whenComplete((r, err) -> Minecraft.getInstance().execute(() -> {
            loading = false;
            long now = System.currentTimeMillis();
            boolean changed;
            if (err != null) {
                String was = problem;
                problem = "Agent Office isn't reachable (" + OfficeScreen.rootMessage(err) + ")";
                changed = !problem.equals(was);
                loadedAt = now;
            } else {
                changed = !r.projects().equals(projects) || !r.tabs().equals(openTabs) || problem != null
                        || r.rosters().entrySet().stream().anyMatch(e -> !e.getValue().equals(rosters.get(e.getKey())))
                        || r.statuses().entrySet().stream().anyMatch(e -> !e.getValue().equals(statuses.get(e.getKey())));
                client = r.client();
                projects = r.projects();
                openTabs = r.tabs();
                rosters.putAll(r.rosters());
                statuses.putAll(r.statuses());
                problem = null;
                if (gen == generation) {
                    loadedAt = now;
                    if (full) fullLoadedAt = now;
                }
            }
            Minecraft mc = Minecraft.getInstance();
            if (!(mc.screen instanceof WorkspaceScreen ws)) return;
            // Out of date already (another project shown, or a session added meanwhile): go again.
            String shown = ws.projectId();
            if (gen != generation || shown != null && !shown.equals(focus)) refresh(shown, false);
            if (changed) ws.rebuildWidgets();
        }));
    }

    @Override
    public void tick() {
        super.tick();
        if (++wsTicks % REFRESH_TICKS == 0) refresh(projectId(), false);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        if (mouseX < left && mouseY > top) {
            String p = projectId();
            scrolls.put(p, scrolls.getOrDefault(p, 0) - (int) Math.signum(scrollY));
            rebuildWidgets();
            return true;
        }
        return super.mouseScrolled(mouseX, mouseY, scrollX, scrollY);
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.renderBackground(g, mouseX, mouseY, partialTick);
        g.fill(frameLeft, frameTop, right, top, Theme.CARD);
        g.fill(frameLeft, top - 1, right, top, Theme.EDGE_2);
        if (sidebarWidth() == 0) return;
        g.fill(frameLeft, top, left, bottom, Theme.CARD);
        g.fill(left - 1, top, left, bottom, Theme.EDGE_2);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        if (sidebarWidth() == 0) return;
        int x = frameLeft + 6;
        g.drawString(font, bold("Roster", SIDEBAR - 12), x, top + 5, Theme.TXT, false);
        String current = projectId();
        if (current != null && rosters.containsKey(current) && rosters.get(current).isEmpty()) {
            g.drawString(font, "No agents yet", x, top + 20, Theme.TXT_3, false);
        }
        int y = bottom - 24 - noteLines.size() * 10;
        for (FormattedCharSequence line : noteLines) {
            g.drawString(font, line, x, y, Theme.TXT_3, false);
            y += 10;
        }
        sessionRows.forEach((rowY, slot) -> {
            String st = statuses.get(slot.instanceId());
            int dot = "running".equals(st) ? Theme.OK : "needs_attention".equals(st) ? Theme.AMBER : Theme.BG_4;
            g.fill(left - 10, rowY + 5, left - 6, rowY + 9, dot);
        });
    }
}
