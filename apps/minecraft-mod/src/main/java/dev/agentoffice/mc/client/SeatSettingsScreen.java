package dev.agentoffice.mc.client;

import com.google.gson.JsonObject;
import dev.agentoffice.mc.client.ui.FlatButton;
import dev.agentoffice.mc.client.ui.FlatCycle;
import dev.agentoffice.mc.client.ui.TabletScreen;
import dev.agentoffice.mc.client.ui.Theme;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.Api;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.network.chat.Component;

/** One seat's own label, model, effort and permission mode ("" = use the agent's default). */
final class SeatSettingsScreen extends TabletScreen {
    private final OfficeScreen parent;
    private final AgentOfficeClient client;
    private final Api.Instance seat;
    private final Api.Agent agent;
    private EditBox label;
    private FlatCycle<String> model;
    private FlatCycle<String> effort;
    private FlatCycle<String> permission;
    private String error;
    private boolean saving;

    SeatSettingsScreen(OfficeScreen parent, AgentOfficeClient client, Api.Instance seat, Api.Agent agent) {
        super(Component.literal("Seat settings"));
        this.parent = parent;
        this.client = client;
        this.seat = seat;
        this.agent = agent;
    }

    @Override
    protected void init() {
        super.init();
        int w = Math.min(260, right - left - PAD * 2);
        int x = left + (right - left - w) / 2;
        int y = top + 40;
        String labelValue = label != null ? label.getValue() : nz(seat.slot().label());
        label = new EditBox(font, x + 90, y, w - 90, 16, Component.literal("Label"));
        label.setMaxLength(60);
        label.setValue(labelValue);
        label.setHint(Component.literal(seat.slot().agentId()).withColor(Theme.TXT_4));
        addRenderableWidget(label);
        model = addRenderableWidget(new FlatCycle<>(x + 90, y + 24, w - 90, 16, options(Api.MODELS, seat.model()),
                model != null ? model.value() : nz(seat.model()), v -> v.isEmpty() ? def(agent == null ? null : agent.defaultModel()) : v));
        effort = addRenderableWidget(new FlatCycle<>(x + 90, y + 48, w - 90, 16, options(Api.EFFORTS, seat.effort()),
                effort != null ? effort.value() : nz(seat.effort()), v -> v.isEmpty() ? def(agent == null ? null : agent.defaultEffort()) : v));
        permission = addRenderableWidget(new FlatCycle<>(x + 90, y + 72, w - 90, 16, options(Api.PERMISSION_MODES, seat.permissionMode()),
                permission != null ? permission.value() : nz(seat.permissionMode()), v -> v.isEmpty() ? "agent default" : v));
        addRenderableWidget(new FlatButton(x + w - 60, y + 104, 60, 16, "Save", FlatButton.Kind.PRIMARY, b -> save())).active = !saving;
        addRenderableWidget(new FlatButton(x + w - 124, y + 104, 60, 16, "Cancel", FlatButton.Kind.GHOST, b -> onClose()));
        setInitialFocus(label);
    }

    private void save() {
        if (saving) return;
        JsonObject patch = new JsonObject();
        if (!label.getValue().trim().equals(nz(seat.slot().label()))) patch.addProperty("label", label.getValue().trim());
        if (!Objects.equals(model.value(), nz(seat.model()))) patch.addProperty("model", model.value());
        if (!Objects.equals(effort.value(), nz(seat.effort()))) patch.addProperty("effort", effort.value());
        if (!Objects.equals(permission.value(), nz(seat.permissionMode()))) patch.addProperty("permissionMode", permission.value());
        if (patch.size() == 0) {
            onClose();
            return;
        }
        saving = true;
        rebuildWidgets();
        Connection.IO.execute(() -> {
            try {
                client.patchInstance(seat.slot(), patch);
                Minecraft.getInstance().execute(() -> {
                    // Only if the player is still here: never pull them out of the game.
                    if (Minecraft.getInstance().screen == this) Minecraft.getInstance().setScreen(parent);
                    parent.load();
                });
            } catch (IOException e) {
                Minecraft.getInstance().execute(() -> {
                    saving = false;
                    error = "Couldn't save: " + e.getMessage();
                    rebuildWidgets();
                });
            }
        });
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        int w = Math.min(260, right - left - PAD * 2);
        int x = left + (right - left - w) / 2;
        int y = top + 40;
        g.drawString(font, Component.literal(seat.slot().displayName() + " · " + seat.slot().projectName()).withStyle(s -> s.withBold(true)),
                x, top + 14, Theme.TXT, false);
        g.drawString(font, "Applies from this seat's next message; the agent definition is unchanged.", x, top + 25, Theme.TXT_4, false);
        String[] names = {"Label", "Model", "Effort", "Permissions"};
        for (int i = 0; i < names.length; i++) g.drawString(font, names[i], x, y + 4 + i * 24, Theme.TXT_2, false);
        if (error != null) g.drawString(font, font.plainSubstrByWidth(error, w), x, y + 126, Theme.RED, false);
    }

    @Override
    protected GuiEventListener typingTarget() {
        return label;
    }

    @Override
    public void onClose() {
        minecraft.setScreen(parent);
    }

    /** The choices plus the seat's own current value, so it stays selectable after cycling away. */
    private static List<String> options(List<String> base, String original) {
        if (original == null || base.contains(original)) return base;
        List<String> all = new ArrayList<>(base);
        all.add(original);
        return all;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private static String def(String agentDefault) {
        return agentDefault == null || agentDefault.isEmpty() ? "agent default" : "agent default (" + agentDefault + ")";
    }
}
