package dev.agentoffice.mc.client.ui;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** A chat image at full size (scaled to fit the tablet); any click or Esc goes back. */
public final class ImageScreen extends TabletScreen {
    private final Screen parent;
    private final ImageCache.Img img;

    public ImageScreen(Screen parent, ImageCache.Img img) {
        super(Component.literal("Image"));
        this.parent = parent;
        this.img = img;
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        int aw = right - left - PAD * 2;
        int ah = bottom - top - PAD * 2 - 12;
        double scale = Math.min(1.0 * aw / img.width(), 1.0 * ah / img.height());
        scale = Math.min(scale, 4.0);
        int w = Math.max(1, (int) (img.width() * scale));
        int h = Math.max(1, (int) (img.height() * scale));
        int x = left + (right - left - w) / 2;
        int y = top + PAD + (ah - h) / 2;
        g.blit(img.texture(), x, y, w, h, 0, 0, img.width(), img.height(), img.width(), img.height());
        String hint = img.width() + " × " + img.height() + "  ·  click or Esc to go back";
        g.drawString(font, hint, left + (right - left - font.width(hint)) / 2, bottom - PAD - 9, Theme.TXT_4, false);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        onClose();
        return true;
    }

    @Override
    public void onClose() {
        if (minecraft != null) minecraft.setScreen(parent);
    }
}
