package dev.agentoffice.mc.client;

import dev.agentoffice.mc.client.ui.Theme;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;

/** A project tab with no chat open yet: the roster on the left is where one starts. */
final class ProjectScreen extends WorkspaceScreen {
    private final String projectId;

    /** {@code projectId} null: the first tab, once the tabs are known. */
    ProjectScreen(String projectId) {
        super(Component.literal("Agent Office"));
        this.projectId = projectId;
    }

    @Override
    protected String projectId() {
        return projectId != null ? projectId : firstTab();
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        String reason = emptyReason();
        String text = reason != null ? reason : "Pick a session on the left, or add an agent with Manage agents.";
        g.drawCenteredString(font, font.plainSubstrByWidth(text, right - left - 16), (left + right) / 2, (top + bottom) / 2, Theme.TXT_3);
    }
}
