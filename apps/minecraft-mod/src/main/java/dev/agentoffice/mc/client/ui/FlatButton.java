package dev.agentoffice.mc.client.ui;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

/** A flat button in Agent Office's style instead of Minecraft's stone one. */
public class FlatButton extends Button {
    public enum Kind { NORMAL, PRIMARY, DANGER, GHOST }

    private final Kind kind;
    private boolean alignLeft;

    public FlatButton(int x, int y, int width, int height, Component message, Kind kind, OnPress onPress) {
        super(x, y, width, height, message, onPress, DEFAULT_NARRATION);
        this.kind = kind;
    }

    public FlatButton(int x, int y, int width, int height, String message, Kind kind, OnPress onPress) {
        this(x, y, width, height, Component.literal(message), kind, onPress);
    }

    /** Left-aligned label, for list rows. */
    public FlatButton alignLeft() {
        alignLeft = true;
        return this;
    }

    @Override
    protected void renderWidget(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        boolean hot = active && isHoveredOrFocused();
        int bg = !active && kind != Kind.GHOST ? Theme.CARD_2 : switch (kind) {
            case PRIMARY -> hot ? 0xFF9D8FFF : Theme.ACCENT;
            case DANGER -> hot ? 0x40F87171 : 0x24F87171;
            case GHOST -> hot ? Theme.CARD_3 : 0;
            case NORMAL -> hot ? Theme.BG_4 : Theme.CARD_3;
        };
        int fg = !active ? Theme.TXT_4 : switch (kind) {
            case PRIMARY -> 0xFFFFFFFF;
            case DANGER -> Theme.RED;
            case GHOST -> hot ? Theme.TXT : Theme.TXT_2;
            case NORMAL -> Theme.TXT;
        };
        if (bg != 0) g.fill(getX(), getY(), getX() + width, getY() + height, bg);
        if (kind != Kind.GHOST) g.renderOutline(getX(), getY(), width, height, hot ? Theme.LINE : Theme.EDGE_2);
        Font font = Minecraft.getInstance().font;
        String text = font.plainSubstrByWidth(getMessage().getString(), width - 6);
        int tx = alignLeft ? getX() + 6 : getX() + (width - font.width(text)) / 2;
        g.drawString(font, text, tx, getY() + (height - 8) / 2, fg, false);
    }
}
