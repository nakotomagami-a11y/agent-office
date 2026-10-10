package dev.agentoffice.mc.client.ui;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.MultiLineEditBox;
import net.minecraft.network.chat.Component;

/** The chat's multi-line input, drawn flat like Agent Office's composer. */
public final class Composer extends MultiLineEditBox {
    public Composer(Font font, int x, int y, int width, int height, Component placeholder) {
        super(font, x, y, width, height, placeholder, Component.literal("Message"));
    }

    @Override
    protected void renderBackground(GuiGraphics g) {
        g.fill(getX(), getY(), getX() + getWidth(), getY() + getHeight(), Theme.CARD_2);
        g.renderOutline(getX(), getY(), getWidth(), getHeight(), isFocused() ? Theme.ACCENT : Theme.LINE);
    }
}
