package dev.agentoffice.mc.client.ui;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.locale.Language;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

/**
 * A screen shown on the Agent Tablet: the world stays visible around a device bezel, and the
 * display inside it is painted in Agent Office's colours. Subclasses lay out inside
 * {@link #left}..{@link #right} x {@link #top}..{@link #bottom}; a workspace screen reserves a sidebar and
 * a tab strip in the display ({@link #frameLeft}, {@link #frameTop}) around that.
 */
public abstract class TabletScreen extends Screen {
    private static final int OUTER = 6;
    private static final int BEZEL = 6;
    protected static final int PAD = 8;

    protected int left;
    protected int top;
    protected int right;
    protected int bottom;
    protected int frameLeft;
    protected int frameTop;

    protected TabletScreen(Component title) {
        super(title);
    }

    protected int sidebarWidth() {
        return 0;
    }

    protected int tabsHeight() {
        return 0;
    }

    @Override
    protected void init() {
        int maxW = 760 + sidebarWidth();
        int w = Math.min(width - OUTER * 2, maxW);
        int x0 = (width - w) / 2;
        frameLeft = x0 + BEZEL;
        frameTop = OUTER + BEZEL;
        left = frameLeft + sidebarWidth();
        right = x0 + w - BEZEL;
        top = frameTop + tabsHeight();
        bottom = height - OUTER - BEZEL;
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        if (minecraft != null && minecraft.level != null) {
            renderTransparentBackground(g);
        } else {
            super.renderBackground(g, mouseX, mouseY, partialTick);
        }
        int x0 = frameLeft - BEZEL;
        int y0 = frameTop - BEZEL;
        int x1 = right + BEZEL;
        int y1 = bottom + BEZEL;
        g.fill(x0 + 1, y0, x1 - 1, y1, Theme.BEZEL);
        g.fill(x0, y0 + 1, x1, y1 - 1, Theme.BEZEL);
        g.renderOutline(x0, y0, x1 - x0, y1 - y0, Theme.BEZEL_EDGE);
        g.fill((x0 + x1) / 2 - 1, y0 + 2, (x0 + x1) / 2 + 1, y0 + 4, 0xFF0B0C10);
        g.fill(frameLeft, frameTop, right, bottom, Theme.CANVAS);
    }

    /** Bold text cut to {@code width}, measured bold (bold glyphs are wider than plainSubstrByWidth assumes). */
    protected FormattedCharSequence bold(String text, int width) {
        return Language.getInstance().getVisualOrder(font.substrByWidth(Component.literal(text).withStyle(s -> s.withBold(true)), Math.max(0, width)));
    }

    /** Where focus goes after a click: the screen's text field, or nothing. */
    protected GuiEventListener typingTarget() {
        return null;
    }

    /**
     * A clicked button keeps focus in vanilla, so Space/Enter would press it again — and here buttons
     * act on Agent Office (new thread, add seat, change model). A click that rebuilt the widgets also
     * leaves focus on the detached old button. Either way, focus goes back to the text field.
     */
    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        boolean handled = super.mouseClicked(mouseX, mouseY, button);
        GuiEventListener focused = getFocused();
        if (focused instanceof AbstractButton || (focused != null && !children().contains(focused))) {
            GuiEventListener target = typingTarget();
            setFocused(target != null && children().contains(target) ? target : null);
        }
        return handled;
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
