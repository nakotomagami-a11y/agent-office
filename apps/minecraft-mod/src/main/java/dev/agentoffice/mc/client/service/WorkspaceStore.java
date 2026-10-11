package dev.agentoffice.mc.client.service;

import dev.agentoffice.mc.core.AgentNames;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.Async;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

/**
 * What the tablet knows of the office, shared by every workspace screen so moving between sessions never starts from an
 * empty sidebar: the projects, the desktop app's open tabs, each tab's roster, and what the player left where. Agents'
 * statuses are {@link AgentStatus}'s. Main thread only.
 */
public final class WorkspaceStore {
    private static final long STALE_MS = 4_000;
    /** Projects, the app's tabs and every tab's roster; the shown project is refreshed more often. */
    private static final long FULL_STALE_MS = 30_000;
    /** SeatAdder gives up within about four minutes; a confirm screen dropped meanwhile never calls back. */
    private static final long ADD_EXPIRES_MS = 240_000;
    private static final long NOTE_MS = 10_000;

    private static AgentOfficeClient client;
    private static List<Api.Project> projects = List.of();
    private static List<String> openTabs = List.of();
    private static final Map<String, List<Api.Instance>> rosters = new HashMap<>();
    private static final Map<String, Api.Slot> lastSlot = new HashMap<>();
    private static final Set<String> collapsed = new HashSet<>();
    private static final Map<String, Double> scrolls = new HashMap<>();
    private static String lastProject;
    private static String problem;
    /** What "+ New session" is doing or why it failed; refreshes leave it alone. */
    private static String addNote;
    private static long addingSince;
    private static long addNoteUntil;
    private static long loadedAt;
    private static long fullLoadedAt;
    private static boolean loading;
    /** Bumped when what is loaded is known to be out of date (a session added). */
    private static int generation;

    /** How a refresh went: whether anything shown changed, and whether it was already out of date when it landed. */
    public record Outcome(boolean changed, boolean superseded) {}

    private record Loaded(AgentOfficeClient client, List<Api.Project> projects, List<String> tabs, Map<String, List<Api.Instance>> rosters) {}

    private WorkspaceStore() {}

    // ── what Agent Office has ───────────────────────────────────────────────

    /** Null until the first load. */
    public static AgentOfficeClient client() {
        return client;
    }

    public static List<Api.Project> projects() {
        return projects;
    }

    public static Api.Project project(String id) {
        return projects.stream().filter(p -> p.id().equals(id)).findFirst().orElse(null);
    }

    /** The desktop app's open tabs, as project ids; empty when it has none (or is too old to say). */
    public static List<String> openTabs() {
        return openTabs;
    }

    /** Null until that project's roster is loaded. */
    public static List<Api.Instance> roster(String projectId) {
        return projectId == null ? null : rosters.get(projectId);
    }

    /** Why the workspace is empty or out of date; null when Agent Office answered. */
    public static String problem() {
        return problem;
    }

    public static boolean loading() {
        return loading;
    }

    /** The refresh a screen opening now needs: none, the shown project, or everything. */
    public static void refreshIfStale(String focus, Consumer<Outcome> done) {
        long now = System.currentTimeMillis();
        if (now - fullLoadedAt > FULL_STALE_MS) refresh(focus, true, done);
        else if (now - loadedAt > STALE_MS) refresh(focus, false, done);
    }

    /** Everything is due again (each project's roster, the tabs) once {@link #FULL_STALE_MS} has passed. */
    public static boolean fullDue() {
        return System.currentTimeMillis() - fullLoadedAt > FULL_STALE_MS;
    }

    /**
     * The shown project's roster; with {@code full}, also the projects, the app's tabs and every tab's roster. A
     * project that fails to load keeps what was known of it. One refresh at a time: a call while one runs does nothing.
     */
    public static void refresh(String focus, boolean full, Consumer<Outcome> done) {
        if (loading) return;
        loading = true;
        int gen = generation;
        List<Api.Project> knownProjects = projects;
        List<String> knownTabs = openTabs;
        AgentOffice.call(() -> true, c -> {
            List<Api.Project> ps = full || knownProjects.isEmpty() ? c.projects() : knownProjects;
            List<String> tabs = knownTabs;
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
            return new Loaded(c, ps, tabs, rs);
        }, r -> {
            loading = false;
            boolean changed = !r.projects().equals(projects) || !r.tabs().equals(openTabs) || problem != null
                    || r.rosters().entrySet().stream().anyMatch(e -> !e.getValue().equals(rosters.get(e.getKey())));
            client = r.client();
            projects = r.projects();
            openTabs = r.tabs();
            rosters.putAll(r.rosters());
            problem = null;
            long now = System.currentTimeMillis();
            if (gen == generation) {
                loadedAt = now;
                if (full) fullLoadedAt = now;
            }
            done.accept(new Outcome(changed, gen != generation));
        }, e -> {
            loading = false;
            String was = problem;
            problem = "Agent Office isn't reachable (" + Async.message(e) + ")";
            loadedAt = System.currentTimeMillis();
            done.accept(new Outcome(!problem.equals(was), gen != generation));
        });
    }

    // ── what the player left where ──────────────────────────────────────────

    public static String lastProject() {
        return lastProject;
    }

    /** {@code slot}'s chat is open: the tablet comes back to it, and to its project. */
    public static void opened(Api.Slot slot) {
        lastSlot.put(slot.projectId(), slot);
        lastProject = slot.projectId();
    }

    public static void openedProject(String projectId) {
        lastProject = projectId;
    }

    /** The last chat in that project, unless its session was removed since. */
    public static Api.Slot lastSlot(String projectId) {
        Api.Slot last = lastSlot.get(projectId);
        List<Api.Instance> roster = rosters.get(projectId);
        if (last != null && roster != null && roster.stream().noneMatch(i -> i.slot().instanceId().equals(last.instanceId()))) {
            lastSlot.remove(projectId);
            return null;
        }
        return last;
    }

    /** An agent's sessions folded away in the roster, by "project/agent". */
    public static boolean collapsed(String key) {
        return collapsed.contains(key);
    }

    public static void toggleCollapsed(String key) {
        if (!collapsed.remove(key)) collapsed.add(key);
    }

    public static double scroll(String projectId) {
        return scrolls.getOrDefault(projectId, 0.0);
    }

    public static void scroll(String projectId, double amount) {
        scrolls.put(projectId, amount);
    }

    // ── "+ New session" ─────────────────────────────────────────────────────

    public static boolean adding() {
        return addingSince > 0 && System.currentTimeMillis() - addingSince < ADD_EXPIRES_MS;
    }

    public static String addNote() {
        return addNote;
    }

    public static void addStarted(String agentId) {
        addingSince = System.currentTimeMillis();
        addNoteUntil = Long.MAX_VALUE;
        addNote = "Adding a " + AgentNames.of(agentId) + " session… (making a git worktree can take a while)";
    }

    /** Added: what is loaded misses it, so the next refresh's result is out of date before it lands. */
    public static void added() {
        addingSince = 0;
        addNote = null;
        generation++;
    }

    public static void addFailed(String message) {
        addingSince = 0;
        addNote = message;
        addNoteUntil = System.currentTimeMillis() + NOTE_MS;
    }

    /** True once, when a failure note has been shown long enough and goes. */
    public static boolean expireNote() {
        if (addNote == null || System.currentTimeMillis() <= addNoteUntil) return false;
        addNote = null;
        return true;
    }

    /** Every project shown as a tab: the app's open tabs, all projects when it has none, plus {@code current}. */
    public static List<Api.Project> tabProjects(String current) {
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
}
