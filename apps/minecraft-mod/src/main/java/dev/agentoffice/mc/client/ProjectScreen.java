package dev.agentoffice.mc.client;

import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

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
        List<FormattedCharSequence> lines = font.split(Component.literal(text), Math.min(280, right - left - 24));
        int y = (top + bottom) / 2 - lines.size() * 5;
        for (FormattedCharSequence line : lines) {
            g.drawString(font, line, (left + right - font.width(line)) / 2, y, PANEL_TEXT, false);
            y += 10;
        }
    }
}
