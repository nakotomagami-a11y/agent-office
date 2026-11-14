package dev.agentoffice.mc.client.ui;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

/**
 * Minecraft's own button; the label colour carries the kind (primary: accent, danger: red). GHOST is
 * the exception: a flat list row with no button face, for screens that list things as rows.
 */
public class FlatButton extends Button {
    public enum Kind { NORMAL, PRIMARY, DANGER, GHOST }

    /** RGB only: vanilla adds the widget's alpha. Light enough to read on the stone face. */
    private static final int PRIMARY_TEXT = 0xD6CEFF;
    private static final int DANGER_TEXT = 0xFF5555;

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

    //? if neoforge {
    @Override
    public int getFGColor() {
        if (!active) return super.getFGColor();
        return switch (kind) {
            case PRIMARY -> PRIMARY_TEXT;
            case DANGER -> DANGER_TEXT;
            default -> super.getFGColor();
        };
    }
    //?}

    @Override
    public void renderString(GuiGraphics g, Font font, int color) {
        //? if fabric {
        /*// Fabric has no getFGColor (a NeoForge hook): the kind's colour, at the alpha vanilla gave.
        if (active && (kind == Kind.PRIMARY || kind == Kind.DANGER)) color = color & 0xFF000000 | (kind == Kind.PRIMARY ? PRIMARY_TEXT : DANGER_TEXT);
        *///?}
        if (!alignLeft) {
            super.renderString(g, font, color);
            return;
        }
        int minX = getX() + 6;
        //? if >=1.21 {
        renderScrollingString(g, font, getMessage(), minX + font.width(getMessage()) / 2, minX, getY(), getX() + width - 2, getY() + height, color);
        //?} else {
        /*// 1.20.1's renderScrollingString centres text that fits: left-aligned, it is drawn here, scrolled only when it overflows.
        if (font.width(getMessage()) <= getX() + width - 2 - minX) g.drawString(font, getMessage(), minX, getY() + (height - 8) / 2, color);
        else renderScrollingString(g, font, getMessage(), minX, getY(), getX() + width - 2, getY() + height, color);
        *///?}
    }

    @Override
    protected void renderWidget(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        if (kind != Kind.GHOST) {
            super.renderWidget(g, mouseX, mouseY, partialTick);
            return;
        }
        boolean hot = active && isHoveredOrFocused();
        if (hot) g.fill(getX(), getY(), getX() + width, getY() + height, Theme.CARD_3);
        int fg = !active ? Theme.TXT_4 : hot ? Theme.TXT : Theme.TXT_2;
        Font font = Minecraft.getInstance().font;
        String text = font.plainSubstrByWidth(getMessage().getString(), width - 6);
        int tx = alignLeft ? getX() + 6 : getX() + (width - font.width(text)) / 2;
        g.drawString(font, text, tx, getY() + (height - 8) / 2, fg, false);
    }
}
