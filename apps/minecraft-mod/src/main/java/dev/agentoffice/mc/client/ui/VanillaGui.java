package dev.agentoffice.mc.client.ui;

import net.minecraft.client.gui.GuiGraphics;

/** Vanilla's container look, drawn: a window's edge and a slot's sunken bevel. */
public final class VanillaGui {
    private VanillaGui() {}

    /** A window: black outline with cut corners, light top-left, dark bottom-right, grey inside. */
    public static void panel(GuiGraphics g, int x0, int y0, int x1, int y1) {
        g.fill(x0 + 1, y0, x1 - 1, y1, Theme.Vanilla.OUTLINE);
        g.fill(x0, y0 + 1, x1, y1 - 1, Theme.Vanilla.OUTLINE);
        g.fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, Theme.Vanilla.PANEL);
        g.fill(x0 + 1, y0 + 1, x1 - 3, y0 + 3, Theme.Vanilla.LIGHT);
        g.fill(x0 + 1, y0 + 1, x0 + 3, y1 - 3, Theme.Vanilla.LIGHT);
        g.fill(x0 + 3, y1 - 3, x1 - 1, y1 - 1, Theme.Vanilla.SHADOW);
        g.fill(x1 - 3, y0 + 3, x1 - 1, y1 - 1, Theme.Vanilla.SHADOW);
    }

    /** A slot's bevel filling {@code w}×{@code h} (dark top-left, light bottom-right, mid-tone corners), {@code inside} within. */
    public static void slot(GuiGraphics g, int x, int y, int w, int h, int inside) {
        g.fill(x, y, x + w, y + h, Theme.Vanilla.SLOT_SHADOW);
        g.fill(x + 1, y + 1, x + w, y + h, Theme.Vanilla.LIGHT);
        g.fill(x + w - 1, y, x + w, y + 1, Theme.Vanilla.SLOT);
        g.fill(x, y + h - 1, x + 1, y + h, Theme.Vanilla.SLOT);
        g.fill(x + 1, y + 1, x + w - 1, y + h - 1, inside);
    }
}
