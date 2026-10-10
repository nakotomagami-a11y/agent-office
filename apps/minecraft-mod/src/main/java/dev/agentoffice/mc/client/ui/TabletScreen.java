package dev.agentoffice.mc.client.ui;

import com.mojang.blaze3d.platform.Window;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.MultiLineEditBox;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.locale.Language;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.FormattedCharSequence;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;

/**
 * A screen shown on the Agent Tablet, drawn like any other in-game window: the world dimmed (not
 * blurred), vanilla's grey window panel, vanilla widgets, and the content in dark sunken wells.
 * Subclasses lay out inside {@link #left}..{@link #right} x {@link #top}..{@link #bottom}; a workspace screen
 * reserves a sidebar inside the window ({@link #frameLeft}) and room for tabs above it ({@link #panelTop}).
 */
public abstract class TabletScreen extends Screen {
    private static final int OUTER = 6;
    /** Window edge to content, as in vanilla's container screens. */
    private static final int BEZEL = 7;
    /** Vanilla's plain window panel (the demo screen's), 248×166 in a 256² texture, 4-px border. */
    private static final ResourceLocation PANEL = ResourceLocation.withDefaultNamespace("textures/gui/demo_background.png");
    /** The dark well content sits in (the chat, the roster, other screens' whole content). */
    protected static final int WELL = 0xFF101114;
    /** Text on the grey panel, as vanilla's container titles: dark, no shadow. */
    protected static final int PANEL_TEXT = 0x404040;
    protected static final int PAD = 8;

    protected int left;
    protected int top;
    protected int right;
    protected int bottom;
    protected int frameLeft;
    protected int frameTop;
    /** The window's edges; tabs (when there are) sit above its top. */
    protected int panelTop;
    protected int panelLeft;
    protected int panelRight;

    protected TabletScreen(Component title) {
        super(title);
    }

    protected int sidebarWidth() {
        return 0;
    }

    /** Room above the window for tabs. */
    protected int tabsHeight() {
        return 0;
    }

    /**
     * The tablet keeps its own GUI scale, like a device has its own DPI: the player's scale, lowered
     * until the screen is at least this many GUI units. Whole numbers only, so the pixel font stays crisp.
     */
    private static final int MIN_W = 640;
    private static final int MIN_H = 360;

    /**
     * Called by Screen#init and on every rebuild/resize; a window resize resets the scale first. Only the
     * screen being shown may set it: a late async rebuild of a closed screen must not rescale the game.
     */
    private void applyScale() {
        if (minecraft.screen != this) return;
        Window win = minecraft.getWindow();
        boolean unicode = minecraft.options.forceUnicodeFont().get();
        int scale = win.calculateScale(minecraft.options.guiScale().get(), unicode);
        while (scale > 1 && (win.getWidth() / scale < MIN_W || win.getHeight() / scale < MIN_H)) scale--;
        if (unicode && scale > 1 && scale % 2 != 0) scale--; // as vanilla: the unicode font needs even scales
        if (win.getGuiScale() != scale) win.setGuiScale(scale);
        width = win.getGuiScaledWidth();
        height = win.getGuiScaledHeight();
    }

    /** The next screen (or the HUD) gets the player's own scale back; subclasses use {@link #onRemoved}. */
    @Override
    public final void removed() {
        onRemoved();
        Window win = minecraft.getWindow();
        win.setGuiScale(win.calculateScale(minecraft.options.guiScale().get(), minecraft.options.forceUnicodeFont().get()));
    }

    /** What Screen#removed is for: this screen is no longer shown (closed, or another opened on top). */
    protected void onRemoved() {}

    @Override
    protected void init() {
        applyScale();
        int maxW = 760 + sidebarWidth();
        int w = Math.min(width - OUTER * 2, maxW);
        int x0 = (width - w) / 2;
        panelTop = OUTER + tabsHeight();
        panelLeft = x0;
        panelRight = x0 + w;
        frameLeft = x0 + BEZEL;
        frameTop = panelTop + BEZEL;
        left = frameLeft + sidebarWidth();
        right = x0 + w - BEZEL;
        top = frameTop;
        bottom = height - OUTER - BEZEL;
    }

    /** As a container screen: the world dimmed behind vanilla's window panel; then the content's well(s). */
    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        if (minecraft.level == null) {
            renderPanorama(g, partialTick);
            renderBlurredBackground(partialTick);
            renderMenuBackground(g);
        } else {
            renderTransparentBackground(g);
        }
        panel(g, panelLeft, panelTop, panelRight - panelLeft, bottom + BEZEL - panelTop);
        renderWells(g);
        NeoForge.EVENT_BUS.post(new ScreenEvent.BackgroundRendered(this, g));
    }

    /** One well holding the whole content; screens with their own layout draw theirs. */
    protected void renderWells(GuiGraphics g) {
        well(g, frameLeft, frameTop, right - frameLeft, bottom - frameTop);
    }

    /** Vanilla's window panel at any size: its texture cut by the 4-px border, edges and centre stretched. */
    protected static void panel(GuiGraphics g, int x, int y, int w, int h) {
        int b = 4;
        int[] xs = {x, x + b, x + w - b};
        int[] ws = {b, w - 2 * b, b};
        int[] us = {0, b, 248 - b};
        int[] uws = {b, 248 - 2 * b, b};
        int[] ys = {y, y + b, y + h - b};
        int[] hs = {b, h - 2 * b, b};
        int[] vs = {0, b, 166 - b};
        int[] vhs = {b, 166 - 2 * b, b};
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) g.blit(PANEL, xs[i], ys[j], ws[i], hs[j], us[i], vs[j], uws[i], vhs[j], 256, 256);
        }
    }

    /** A sunken well, bevelled like a vanilla slot (dark top-left, white bottom-right, mid-tone corners), dark inside. */
    protected static void well(GuiGraphics g, int x, int y, int w, int h) {
        g.fill(x, y, x + w, y + h, 0xFF373737);
        g.fill(x + 1, y + 1, x + w, y + h, 0xFFFFFFFF);
        g.fill(x + w - 1, y, x + w, y + 1, 0xFF8B8B8B);
        g.fill(x, y + h - 1, x + 1, y + h, 0xFF8B8B8B);
        g.fill(x + 1, y + 1, x + w - 1, y + h - 1, WELL);
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
        if (focused instanceof AbstractButton || (focused != null && !children().contains(focused))) refocus();
        return handled;
    }

    /**
     * Anything else clicked (a list, its scrollbar) gives focus back on release, not on press, so a
     * scrollbar drag still reaches the list; typing then goes to the text field again.
     */
    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        boolean handled = super.mouseReleased(mouseX, mouseY, button);
        GuiEventListener focused = getFocused();
        if (focused != null && !(focused instanceof EditBox || focused instanceof MultiLineEditBox)) refocus();
        return handled;
    }

    private void refocus() {
        GuiEventListener target = typingTarget();
        setFocused(target != null && children().contains(target) ? target : null);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
