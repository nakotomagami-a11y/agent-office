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
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;

/** First use of a Review Lectern (or a sneak-use): which project's pull requests it shows. */
final class LecternSetupScreen extends TabletScreen {
    private static final int ROW = 22;

    private final AgentOfficeClient client;
    private final String lecternKey;
    /** Cancel from the review's Project… button goes back to that review; from the world it just closes. */
    private final Runnable onCancel;
    private List<Api.Project> projects = new ArrayList<>();
    private String status = "Loading projects…";
    private int scroll;
    private boolean closed;

    LecternSetupScreen(AgentOfficeClient client, String lecternKey, Runnable onCancel) {
        super(Component.literal("Review Lectern"));
        this.client = client;
        this.lecternKey = lecternKey;
        this.onCancel = onCancel;
        load();
    }

    private void load() {
        CompletableFuture.supplyAsync(() -> {
            try {
                return client.projects();
            } catch (IOException e) {
                throw new CompletionException(e);
            }
        }, Connection.IO).whenComplete((ps, err) -> onMain(() -> {
            if (err != null) {
                status = "Couldn't load projects: " + OfficeScreen.rootMessage(err);
            } else {
                projects = ps;
                status = ps.isEmpty() ? "No projects in Agent Office yet." : null;
            }
            rebuildWidgets();
        }));
    }

    @Override
    protected void init() {
        super.init();
        int x = left + PAD;
        int w = right - left - PAD * 2;
        int y = top + 46;
        addRenderableWidget(new FlatButton(x, y, w, 20, "All projects", FlatButton.Kind.PRIMARY,
                b -> pick(new LecternStore.Binding(LecternStore.ALL, "All projects"))).alignLeft());
        y += ROW + 6;
        int visible = Math.max(1, (bottom - 34 - y) / ROW);
        scroll = Math.max(0, Math.min(scroll, projects.size() - visible));
        for (int i = scroll; i < Math.min(projects.size(), scroll + visible); i++) {
            Api.Project p = projects.get(i);
            addRenderableWidget(new FlatButton(x, y, w, 20, Review.visible(p.name()), FlatButton.Kind.NORMAL,
                    b -> pick(new LecternStore.Binding(p.id(), p.name()))).alignLeft());
            y += ROW;
        }
        addRenderableWidget(new FlatButton(right - PAD - 70, bottom - 26, 70, 18, "Cancel", FlatButton.Kind.GHOST, b -> {
            if (onCancel != null) onCancel.run();
            else onClose();
        }));
    }

    private void pick(LecternStore.Binding binding) {
        Lecterns.store().bind(lecternKey, binding);
        Minecraft.getInstance().setScreen(new ReviewScreen(client, binding, lecternKey));
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        int w = right - left - PAD * 2;
        g.drawString(font, bold("Review Lectern", w), left + PAD, top + PAD, Theme.TXT, false);
        g.drawString(font, DiffView.cut(font, "Which project's pull requests should it show?", w), left + PAD, top + PAD + 14, Theme.TXT_3, false);
        g.drawString(font, DiffView.cut(font, "Change it later with Project… in the review.", w), left + PAD, top + PAD + 26, Theme.TXT_4, false);
        if (status != null) g.drawString(font, DiffView.cut(font, status, w), left + PAD, top + 46 + ROW + 10, Theme.TXT_3, false);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double scrollY) {
        int next = Math.max(0, scroll - (int) Math.signum(scrollY));
        if (next != scroll) {
            scroll = next;
            rebuildWidgets();
        }
        return true;
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
