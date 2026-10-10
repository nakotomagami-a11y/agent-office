package dev.agentoffice.mc.client;

import dev.agentoffice.mc.client.ui.DiffView;
import dev.agentoffice.mc.client.ui.FlatButton;
import dev.agentoffice.mc.client.ui.TabletScreen;
import dev.agentoffice.mc.client.ui.Theme;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.LecternStore;
import dev.agentoffice.mc.core.Review;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.TimeUnit;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
import org.lwjgl.glfw.GLFW;

/**
 * A Review Lectern's screen: the bound project's open pull requests, one at a time — files, notes
 * and the diff (docs/minecraft-review-lectern.md). Read-only in this version: the review actions are
 * shown but come with the next update. Everything that came from GitHub is drawn through
 * {@link Review#visible}: a PR must not be able to restyle or reorder what the reviewer sees.
 */
final class ReviewScreen extends TabletScreen {
    private static final int LINE_H = DiffView.LINE_H;
    private static final int FILE_ROW = 22;
    private static final int HEAD_H = 40;
    private static final int FOOT_H = 26;
    private static final int MAX_NOTE_LINES = 14;
    /** Holding ] (key repeat) must not start a GitHub round trip per repeat: only the PR it lands on loads. */
    private static final long STEP_SETTLE_MS = 250;

    private final AgentOfficeClient client;
    private final LecternStore.Binding binding;
    /** Null when opened without a lectern (dev checks): no "Project…" button then. */
    private final String lecternKey;
    private final DiffView diff = new DiffView();

    private List<Review.Pull> queue = List.of();
    private boolean truncated;
    private int skipped;
    private int index;
    private Review.Detail detail;
    private boolean queueLoading;
    private String status = "Loading pull requests…";
    private String hint;
    private String flash;
    private long flashUntil;

    private int fileIndex;
    /** On a refresh, the file to come back to in the reloaded PR. */
    private String restorePath;
    private int leftScroll;
    private int leftContentH;
    private double scrollCarry;
    /** Split note lines for the current detail and width, so a long PR body is not re-split every frame. */
    private final Map<Integer, List<FormattedCharSequence>> noteLines = new HashMap<>();
    private Review.Detail noteLinesDetail;
    /** Notes shortened by the character budget: they say "… more on GitHub" even when few lines show. */
    private final java.util.Set<Integer> cutNotes = new java.util.HashSet<>();
    private int noteLinesWidth = -1;

    private int gen;
    private boolean closed;

    private int bodyTop;
    private int bodyBottom;
    private int leftX0;
    private int leftX1;
    private FlatButton prev;
    private FlatButton next;
    private FlatButton copy;
    /** Where the footer hint must stop: the action buttons, or the screen edge when they gave way. */
    private int footerTextEnd;
    private int footerTextX;

    ReviewScreen(AgentOfficeClient client, LecternStore.Binding binding, String lecternKey) {
        super(Component.literal("Merge review"));
        this.client = client;
        this.binding = binding;
        this.lecternKey = lecternKey;
        loadQueue();
    }

    // ─── Loading ─────────────────────────────────────────────────────────────

    /** {@code skipped}: projects that aren't GitHub repos. {@code error}: set only when nothing could be read. */
    private record Loaded(List<Review.Pull> pulls, boolean truncated, int skipped, IOException error) {}

    private void loadQueue() {
        if (queueLoading) return;
        queueLoading = true;
        int g = ++gen;
        Review.Pull was = queue.isEmpty() ? null : queue.get(index);
        restorePath = detail != null && !detail.files().isEmpty() ? detail.files().get(fileIndex).path() : null;
        status = "Loading pull requests…";
        hint = null;
        detail = null;
        CompletableFuture.supplyAsync(this::fetchQueue, Connection.IO).whenComplete((r, err) -> onMain(() -> {
            queueLoading = false;
            if (g != gen) return;
            if (err != null || r.error() != null) {
                queue = List.of();
                showError(err != null ? err : r.error());
                return;
            }
            queue = r.pulls();
            truncated = r.truncated();
            skipped = r.skipped();
            // Stay on the PR you were reading: the queue may have shifted under it.
            int same = was == null ? -1 : indexOf(was);
            index = same >= 0 ? same : Math.min(index, Math.max(0, queue.size() - 1));
            if (queue.isEmpty()) {
                status = "No open pull requests.";
                hint = skipped > 0 ? skipped + " project(s) skipped: not GitHub repositories." : null;
            } else {
                loadDetail();
            }
        }));
    }

    private int indexOf(Review.Pull p) {
        for (int i = 0; i < queue.size(); i++) {
            Review.Pull q = queue.get(i);
            if (q.number() == p.number() && q.projectId().equals(p.projectId())) return i;
        }
        return -1;
    }

    /** One project, or every project in parallel ("All projects"); a project that fails is skipped, not fatal. */
    private Loaded fetchQueue() {
        try {
            if (!binding.all()) {
                Review.Queue q = client.pulls(binding.projectId(), binding.projectName());
                return new Loaded(q.pulls(), q.truncated(), 0, null);
            }
            List<CompletableFuture<Object>> parts = new ArrayList<>();
            for (Api.Project p : client.projects()) {
                parts.add(CompletableFuture.supplyAsync(() -> {
                    try {
                        return client.pulls(p.id(), p.name());
                    } catch (IOException e) {
                        return e;
                    }
                }, Connection.IO));
            }
            List<Review.Pull> all = new ArrayList<>();
            boolean cut = false;
            int notGithub = 0;
            int read = 0;
            IOException first = null;
            for (CompletableFuture<Object> f : parts) {
                Object r = f.join();
                if (r instanceof Review.Queue q) {
                    all.addAll(q.pulls());
                    cut |= q.truncated();
                    read++;
                } else if (r instanceof Api.ApiException a && "not_github_repo".equals(a.code)) {
                    notGithub++;
                } else if (first == null) {
                    first = (IOException) r;
                }
            }
            all.sort(Comparator.comparing((Review.Pull p) -> p.updatedAt() == null ? "" : p.updatedAt()).reversed());
            // Some projects not being GitHub repos is normal; only "gh can't read anything" is an error.
            return new Loaded(all, cut, notGithub, read == 0 && first != null ? first : null);
        } catch (IOException e) {
            throw new CompletionException(e);
        }
    }

    private void loadDetail() {
        if (queue.isEmpty()) return;
        int g = ++gen;
        Review.Pull p = queue.get(index);
        CompletableFuture.supplyAsync(() -> {
            try {
                return client.pull(p.projectId(), p.projectName(), p.number());
            } catch (IOException e) {
                throw new CompletionException(e);
            }
        }, Connection.IO).whenComplete((d, err) -> onMain(() -> {
            if (g != gen) return;
            if (err != null) {
                showError(err);
                return;
            }
            detail = d;
            status = null;
            fileIndex = 0;
            for (int i = 0; restorePath != null && i < d.files().size(); i++) {
                if (d.files().get(i).path().equals(restorePath)) fileIndex = i;
            }
            restorePath = null;
            leftScroll = 0;
            diff.setFile(d.files().isEmpty() ? null : d.files().get(fileIndex));
        }));
    }

    /** Shows the PR as loading at once; fetches it only once the player stops stepping. */
    private void step(int delta) {
        if (queueLoading || queue.size() < 2) return;
        restorePath = null;
        index = Math.floorMod(index + delta, queue.size());
        int g = ++gen;
        detail = null;
        hint = null;
        status = "Loading #" + queue.get(index).number() + "…";
        CompletableFuture.delayedExecutor(STEP_SETTLE_MS, TimeUnit.MILLISECONDS, Connection.IO).execute(() -> onMain(() -> {
            if (g == gen) loadDetail();
        }));
    }

    private void showError(Throwable err) {
        Throwable t = err instanceof CompletionException && err.getCause() != null ? err.getCause() : err;
        if (t instanceof Api.ApiException a) {
            if (a.status == 404 && a.code == null) {
                status = "This Agent Office has no pull-request review yet.";
                hint = "Run `pnpm server` from the agent-office repo (or update the app), then use the lectern again.";
                return;
            }
            status = switch (a.code == null ? "" : a.code) {
                case "gh_missing" -> "The GitHub CLI (gh) isn't installed.";
                case "gh_unauthenticated" -> "gh isn't signed in to GitHub.";
                case "not_github_repo" -> "This project isn't a GitHub repository.";
                case "github_account_missing" -> "The project's GitHub account was removed.";
                case "pr_not_found" -> "That pull request is gone.";
                case "not_found" -> "This lectern's project no longer exists.";
                case "gh_failed" -> "gh failed: " + Review.visible(a.detail == null ? "no message" : a.detail);
                default -> "Couldn't load pull requests (" + (a.code == null ? "HTTP " + a.status : a.code) + ").";
            };
            hint = "not_found".equals(a.code) ? (lecternKey != null ? "Use Project… below to pick another." : "Pick another project.")
                    : "gh_failed".equals(a.code) ? "Press r to retry." : a.hint;
            return;
        }
        status = "Couldn't reach Agent Office: " + OfficeScreen.rootMessage(t);
        hint = null;
    }

    // ─── Layout ──────────────────────────────────────────────────────────────

    @Override
    protected void init() {
        super.init();
        bodyTop = top + PAD + HEAD_H;
        bodyBottom = bottom - FOOT_H;
        leftX0 = left + PAD;
        leftX1 = leftX0 + Math.max(130, Math.min(220, (right - left) * 28 / 100));
        diff.setBounds(leftX1 + 8, bodyTop, right - PAD, bodyBottom);
        leftScroll = Math.max(0, Math.min(leftScroll, leftContentH - (bodyBottom - bodyTop)));
        noteLinesWidth = -1;

        int y = bottom - 22;
        int x = left + PAD;
        prev = addRenderableWidget(new FlatButton(x, y, 20, 16, "◀", FlatButton.Kind.NORMAL, b -> step(-1)));
        next = addRenderableWidget(new FlatButton(x + 22, y, 20, 16, "▶", FlatButton.Kind.NORMAL, b -> step(1)));
        prev.setTooltip(Tooltip.create(Component.literal("Previous pull request  [")));
        next.setTooltip(Tooltip.create(Component.literal("Next pull request  ]")));
        addRenderableWidget(new FlatButton(x + 46, y, 54, 16, "Refresh", FlatButton.Kind.NORMAL, b -> loadQueue()));
        copy = addRenderableWidget(new FlatButton(x + 102, y, 62, 16, "Copy link", FlatButton.Kind.NORMAL, b -> copyLink()));
        if (lecternKey != null) {
            FlatButton project = addRenderableWidget(new FlatButton(x + 166, y, 56, 16, "Project…", FlatButton.Kind.NORMAL,
                    b -> Minecraft.getInstance().setScreen(new LecternSetupScreen(client, lecternKey,
                            () -> Minecraft.getInstance().setScreen(new ReviewScreen(client, binding, lecternKey))))));
            project.setTooltip(Tooltip.create(Component.literal("Change which project this lectern shows")));
        }

        // The disabled actions sit at the right; on a narrow screen (a large GUI scale) they shorten, then give
        // way: the footer text ("Link copied", key hints) is the only feedback here, so it keeps its room.
        footerTextX = x + (lecternKey != null ? 222 : 164) + 6;
        footerTextEnd = right - PAD;
        int needed = footerTextX + font.width("j/k scroll · n/p file · [ ] PR") + 8;
        String[] labels = {"Merge", "Request changes", "Reject"};
        if (right - PAD - actionsWidth(labels) < needed) labels = new String[] {"Merge", "Changes", "Reject"};
        if (right - PAD - actionsWidth(labels) < needed) return;
        footerTextEnd = right - PAD - actionsWidth(labels) - 8;
        Tooltip later = Tooltip.create(Component.literal("Reviewing from the lectern comes in the next update."));
        int rx = right - PAD;
        for (String label : labels) {
            int w = font.width(label) + 14;
            rx -= w;
            FlatButton.Kind kind = label.equals("Merge") ? FlatButton.Kind.PRIMARY : label.equals("Reject") ? FlatButton.Kind.DANGER : FlatButton.Kind.NORMAL;
            FlatButton b = addRenderableWidget(new FlatButton(rx, y, w, 16, label, kind, btn -> { }));
            b.active = false;
            b.setTooltip(later);
            rx -= 4;
        }
    }

    private int actionsWidth(String[] labels) {
        int w = 0;
        for (String l : labels) w += font.width(l) + 14 + 4;
        return w - 4;
    }

    private void selectFile(int i) {
        if (detail == null || detail.files().isEmpty()) return;
        fileIndex = Math.floorMod(i, detail.files().size());
        diff.setFile(detail.files().get(fileIndex));
    }

    private void copyLink() {
        if (queue.isEmpty() || queue.get(index).url() == null) return;
        Minecraft.getInstance().keyboardHandler.setClipboard(queue.get(index).url());
        flash = "Link copied";
        flashUntil = System.currentTimeMillis() + 2000;
    }

    // ─── Rendering ───────────────────────────────────────────────────────────

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        boolean many = queue.size() > 1;
        prev.active = many;
        next.active = many;
        copy.active = !queue.isEmpty();
        super.render(g, mouseX, mouseY, partialTick);
        renderHeader(g);
        if (detail == null) {
            renderStatus(g);
        } else {
            renderLeft(g);
            if (detail.files().isEmpty()) renderNoDiff(g);
            else diff.render(g, font);
        }
        renderFooterText(g);
    }

    /** The loaded detail's own numbers once it is there; the list snapshot until then. */
    private Review.Pull shown() {
        return detail != null ? detail.pull() : queue.get(index);
    }

    private void renderHeader(GuiGraphics g) {
        int x = left + PAD;
        int y = top + PAD;
        int w = right - left - PAD * 2;
        if (queue.isEmpty()) {
            g.drawString(font, bold("Merge review", w), x, y, Theme.TXT, false);
            g.drawString(font, binding.all() ? "All projects" : Review.visible(binding.projectName()), x, y + 13, Theme.TXT_3, false);
            g.fill(x, y + HEAD_H - 4, right - PAD, y + HEAD_H - 3, Theme.LINE);
            return;
        }
        Review.Pull p = shown();
        String counter = (index + 1) + " of " + queue.size() + (truncated ? "+" : "") + (skipped > 0 ? " · " + skipped + " skipped" : "");
        int cw = font.width(counter);
        g.drawString(font, counter, right - PAD - cw, y, Theme.TXT_3, false);
        String state = stateLabel(p);
        int sw = font.width(state);
        int sx = right - PAD - cw - 12 - sw;
        g.fill(sx - 8, y + 2, sx - 3, y + 7, stateColor(p));
        g.drawString(font, state, sx, y, stateColor(p), false);

        g.drawString(font, bold("Merge review", w), x, y, Theme.TXT, false);
        int tx = x + font.width(bold("Merge review", w)) + 6;
        g.drawString(font, "#" + p.number(), tx, y, Theme.ACCENT_SOFT, false);
        tx += font.width("#" + p.number()) + 6;
        g.drawString(font, cut(Review.visible(p.title()), sx - 14 - tx), tx, y, Theme.TXT, false);

        Review.Link link = detail == null ? null : detail.link();
        String who = link != null && link.agentId() != null ? link.agentId() : p.author();
        String line2 = Review.visible(who + " wants to merge " + p.headRef() + " into " + p.baseRef());
        String stats = "+" + p.additions() + " −" + p.deletions() + "  " + p.changedFiles() + (p.changedFiles() == 1 ? " file" : " files");
        String checks = detail == null ? "" : detail.checks().label();
        int statsW = font.width(stats);
        int checksW = font.width(checks);
        g.drawString(font, stats, right - PAD - statsW, y + 13, Theme.TXT_3, false);
        if (detail != null) {
            Review.Checks c = detail.checks();
            int cc = c.total() == 0 ? Theme.TXT_4 : c.failing() > 0 ? Theme.RED : c.pending() > 0 ? Theme.AMBER : Theme.GREEN;
            g.drawString(font, checks, right - PAD - statsW - 10 - checksW, y + 13, cc, false);
        }
        g.drawString(font, cut(line2, w - statsW - checksW - 20), x, y + 13, Theme.TXT_2, false);

        String line3 = (binding.all() ? Review.visible(p.projectName()) + " · " : "") + linkText();
        g.drawString(font, cut(line3, w), x, y + 25, Theme.TXT_4, false);
        g.fill(x, y + HEAD_H - 4, right - PAD, y + HEAD_H - 3, Theme.LINE);
    }

    private String linkText() {
        if (detail == null) return "";
        Review.Link l = detail.link();
        if (l == null) return "No agent linked yet: you'll pick who gets the feedback.";
        String how = switch (nz(l.source())) {
            case "recorded" -> "it opened this PR";
            case "branch" -> "its branch";
            default -> "picked by you";
        };
        return "Feedback goes to " + nz(l.agentId()) + " (" + nz(l.instanceId()) + ") · " + how;
    }

    private String stateLabel(Review.Pull p) {
        if (p.draft()) return "Draft";
        return switch (nz(p.reviewDecision())) {
            case "CHANGES_REQUESTED" -> "Changes requested";
            case "APPROVED" -> "Approved";
            default -> "Waiting for you";
        };
    }

    private int stateColor(Review.Pull p) {
        if (p.draft()) return Theme.TXT_4;
        return switch (nz(p.reviewDecision())) {
            case "CHANGES_REQUESTED" -> Theme.AMBER;
            case "APPROVED" -> Theme.GREEN;
            default -> Theme.RED;
        };
    }

    private void renderStatus(GuiGraphics g) {
        int x = left + PAD;
        int y = bodyTop + 16;
        int w = right - left - PAD * 2;
        if (status != null) y = paragraph(g, status, x, y, w, Theme.TXT);
        if (hint != null) paragraph(g, hint, x, y + 4, w, Theme.TXT_3);
    }

    private int paragraph(GuiGraphics g, String text, int x, int y, int w, int color) {
        for (FormattedCharSequence line : DiffView.logical(font, text, w)) {
            g.drawString(font, line, x, y, color, false);
            y += LINE_H + 1;
        }
        return y;
    }

    private void renderNoDiff(GuiGraphics g) {
        int x0 = leftX1 + 8;
        int x1 = right - PAD;
        g.fill(x0, bodyTop, x1, bodyBottom, Theme.CARD);
        String msg = detail.diffUnavailable() != null
                ? "The diff couldn't be loaded here (" + Review.visible(detail.diffUnavailable()) + "). See it on GitHub: Copy link."
                : "No files changed.";
        paragraph(g, msg, x0 + 6, bodyTop + 8, x1 - x0 - 12, Theme.TXT_3);
    }

    private void renderLeft(GuiGraphics g) {
        int w = leftX1 - leftX0;
        g.enableScissor(leftX0, bodyTop, leftX1, bodyBottom);
        int y = bodyTop - leftScroll;
        g.drawString(font, "FILES " + detail.files().size(), leftX0, y + 2, Theme.TXT_4, false);
        y += 14;
        for (int i = 0; i < detail.files().size(); i++) {
            Review.DiffFile f = detail.files().get(i);
            if (i == fileIndex) {
                g.fill(leftX0, y, leftX1, y + FILE_ROW - 2, Theme.CARD_3);
                g.fill(leftX0, y, leftX0 + 2, y + FILE_ROW - 2, Theme.ACCENT);
            }
            g.drawString(font, String.valueOf(f.letter()), leftX0 + 5, y + 2, DiffView.letterColor(f.letter()), false);
            String plus = "+" + f.additions();
            String minus = "−" + f.deletions();
            int pw = font.width(plus);
            int mw = font.width(minus);
            g.drawString(font, minus, leftX1 - 3 - mw, y + 2, Theme.RED, false);
            g.drawString(font, plus, leftX1 - 6 - mw - pw, y + 2, Theme.GREEN, false);
            g.drawString(font, cut(Review.visible(f.name()), w - 24 - pw - mw), leftX0 + 15, y + 2, Theme.TXT, false);
            g.drawString(font, cut(Review.visible(f.dir()), w - 18), leftX0 + 15, y + 11, Theme.TXT_4, false);
            y += FILE_ROW;
        }
        y += 6;
        g.fill(leftX0, y, leftX1, y + 1, Theme.LINE);
        y += 6;
        g.drawString(font, "NOTES", leftX0, y, Theme.TXT_4, false);
        y += 12;
        if (detail != noteLinesDetail || w != noteLinesWidth) {
            noteLinesDetail = detail;
            noteLinesWidth = w;
            noteLines.clear();
            cutNotes.clear();
        }
        if (!detail.body().isBlank()) y = noteCard(g, y, -1, shown().author(), "summary", detail.body());
        List<Review.Note> notes = detail.notes();
        for (int i = 0; i < notes.size(); i++) y = noteCard(g, y, i, notes.get(i).author(), verb(notes.get(i)), notes.get(i).body());
        if (detail.body().isBlank() && notes.isEmpty()) {
            g.drawString(font, "No description or reviews yet.", leftX0, y, Theme.TXT_4, false);
            y += 12;
        }
        leftContentH = y + leftScroll - bodyTop;
        g.disableScissor();
    }

    private int noteCard(GuiGraphics g, int y, int id, String author, String verb, String body) {
        int w = leftX1 - leftX0;
        List<FormattedCharSequence> all = noteLines.computeIfAbsent(id, k -> splitNote(id, body, w - 8));
        boolean cut = all.size() > MAX_NOTE_LINES || cutNotes.contains(id);
        List<FormattedCharSequence> lines = cut ? all.subList(0, MAX_NOTE_LINES) : all;
        int h = 16 + lines.size() * LINE_H + (cut ? LINE_H : 0);
        g.fill(leftX0, y, leftX1, y + h, Theme.CARD);
        g.renderOutline(leftX0, y, w, h, Theme.EDGE_2);
        String a = cut(Review.visible(author), w - 8);
        g.drawString(font, a, leftX0 + 4, y + 4, Theme.ACCENT_SOFT, false);
        g.drawString(font, cut(verb, w - 12 - font.width(a)), leftX0 + 8 + font.width(a), y + 4, Theme.TXT_3, false);
        int ly = y + 15;
        for (FormattedCharSequence l : lines) {
            g.drawString(font, l, leftX0 + 4, ly, Theme.TXT_2, false);
            ly += LINE_H;
        }
        if (cut) g.drawString(font, "… more on GitHub", leftX0 + 4, ly, Theme.TXT_4, false);
        return y + h + 4;
    }

    /** A note's first lines only (a PR body can be 64 KB), each source line made visible on its own. */
    private List<FormattedCharSequence> splitNote(int id, String body, int width) {
        if (body.isBlank()) return List.of();
        int budget = (MAX_NOTE_LINES + 1) * Math.max(8, width / 4);
        boolean shortened = body.length() > budget;
        // Never end between the two halves of a surrogate pair.
        int end = shortened && Character.isHighSurrogate(body.charAt(budget - 1)) ? budget - 1 : budget;
        if (shortened) cutNotes.add(id);
        List<FormattedCharSequence> out = new ArrayList<>();
        for (String line : (shortened ? body.substring(0, end) : body).split("\n", -1)) {
            out.addAll(line.isBlank() ? List.of(FormattedCharSequence.EMPTY) : DiffView.logical(font, Review.visible(line), width));
            if (out.size() > MAX_NOTE_LINES) break;
        }
        return out;
    }

    private static String verb(Review.Note n) {
        if (n.state() == null) return "commented";
        return switch (n.state()) {
            case "APPROVED" -> "approved";
            case "CHANGES_REQUESTED" -> "requested changes";
            case "DISMISSED" -> "review dismissed";
            default -> "reviewed";
        };
    }

    private void renderFooterText(GuiGraphics g) {
        boolean flashing = flash != null && System.currentTimeMillis() < flashUntil;
        String text = flashing ? flash : "j/k scroll · n/p file · [ ] PR · w wrap" + (diff.wrap() ? " (on)" : "") + " · r refresh";
        g.drawString(font, cut(text, footerTextEnd - footerTextX), footerTextX, bottom - 18, flashing ? Theme.GREEN : Theme.TXT_4, false);
    }

    private String cut(String s, int width) {
        return DiffView.cut(font, s, width);
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    // ─── Input ───────────────────────────────────────────────────────────────

    /** Scrolling keys by physical position; letter shortcuts by the character typed, so they follow the layout. */
    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        int page = Math.max(1, diff.visibleRows() - 2);
        switch (keyCode) {
            case GLFW.GLFW_KEY_DOWN -> diff.scrollBy(3);
            case GLFW.GLFW_KEY_UP -> diff.scrollBy(-3);
            case GLFW.GLFW_KEY_PAGE_DOWN -> diff.scrollBy(page);
            case GLFW.GLFW_KEY_PAGE_UP -> diff.scrollBy(-page);
            case GLFW.GLFW_KEY_HOME -> diff.toTop();
            case GLFW.GLFW_KEY_END -> diff.toBottom();
            case GLFW.GLFW_KEY_SPACE -> diff.scrollBy(page);
            // Screen would move keyboard focus onto a footer button, where Space/Enter press it.
            case GLFW.GLFW_KEY_LEFT, GLFW.GLFW_KEY_RIGHT, GLFW.GLFW_KEY_TAB -> { }
            default -> {
                return super.keyPressed(keyCode, scanCode, modifiers);
            }
        }
        return true;
    }

    @Override
    public boolean charTyped(char c, int modifiers) {
        switch (Character.toLowerCase(c)) {
            case 'j' -> diff.scrollBy(3);
            case 'k' -> diff.scrollBy(-3);
            case 'n' -> selectFile(fileIndex + 1);
            case 'p' -> selectFile(fileIndex - 1);
            case 'w' -> diff.toggleWrap();
            case ']' -> step(1);
            case '[' -> step(-1);
            case 'r' -> loadQueue();
            default -> {
                return super.charTyped(c, modifiers);
            }
        }
        return true;
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        // A trackpad sends many small deltas: add them up instead of turning each into a full step.
        scrollCarry += scrollY;
        int notches = (int) scrollCarry;
        scrollCarry -= notches;
        if (notches == 0) return true;
        if (mouseX < leftX1) {
            int max = Math.max(0, leftContentH - (bodyBottom - bodyTop));
            leftScroll = Math.max(0, Math.min(max, leftScroll - notches * 20));
        } else {
            diff.scrollBy(-notches * 3);
        }
        return true;
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (detail != null && button == 0 && mouseX >= leftX0 && mouseX < leftX1 && mouseY >= bodyTop && mouseY < bodyBottom) {
            int rel = (int) mouseY - (bodyTop - leftScroll + 14);
            int i = rel / FILE_ROW;
            if (rel >= 0 && i < detail.files().size()) {
                selectFile(i);
                return true;
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    protected void onRemoved() {
        closed = true;
    }

    private void onMain(Runnable r) {
        Minecraft.getInstance().execute(() -> {
            if (!closed) r.run();
        });
    }
}
