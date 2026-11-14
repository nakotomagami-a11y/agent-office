package dev.agentoffice.mc.client.ui;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.ResourceLocation;

/**
 * GUI sprites by their 1.21 id. 1.20.1 has no GUI sprite atlas: there each one the mod draws is a region of the
 * texture it came from (vanilla's widget and tab sheets, the mod's own files), or vanilla 1.20.1's drawn scroller.
 */
public final class Sprites {
    private Sprites() {}

    public static void blit(GuiGraphics g, ResourceLocation sprite, int x, int y, int w, int h) {
        //? if >=1.21 {
        g.blitSprite(sprite, x, y, w, h);
        //?} else {
        /*if (sprite.getPath().equals("widget/scroller_background")) {
            g.fill(x, y, x + w, y + h, 0xFF000000);
        } else if (sprite.getPath().equals("widget/scroller")) {
            g.fill(x, y, x + w, y + h, 0xFF808080);
            g.fill(x, y, x + w - 1, y + h - 1, 0xFFC0C0C0);
        } else {
            Region r = region(sprite);
            if (r != null) g.blit(r.texture, x, y, w, h, r.u, r.v, r.w, r.h, r.texW, r.texH);
        }
        *///?}
    }

    /** Part of a sprite: the {@code w x h} at {@code u, v} of one {@code spriteW x spriteH}, drawn at its size. */
    public static void blit(GuiGraphics g, ResourceLocation sprite, int spriteW, int spriteH, int u, int v, int x, int y, int w, int h) {
        //? if >=1.21 {
        g.blitSprite(sprite, spriteW, spriteH, u, v, x, y, w, h);
        //?} else {
        /*Region r = region(sprite);
        if (r != null) g.blit(r.texture, x, y, r.u + u, r.v + v, w, h, r.texW, r.texH);
        *///?}
    }

    //? if <1.21 {
    /*private record Region(ResourceLocation texture, int u, int v, int w, int h, int texW, int texH) {}

    private static final ResourceLocation WIDGETS = ResourceLocation.withDefaultNamespace("textures/gui/widgets.png");
    private static final ResourceLocation TABS = ResourceLocation.withDefaultNamespace("textures/gui/advancements/tabs.png");
    private static final java.util.Set<ResourceLocation> MISSING = new java.util.HashSet<>();

    private static Region region(ResourceLocation sprite) {
        String path = sprite.getPath();
        if (!sprite.getNamespace().equals("minecraft")) {
            // The mod's own sprites are whole files under textures/gui/sprites (6x6 status dots).
            return new Region(ResourceLocation.fromNamespaceAndPath(sprite.getNamespace(), "textures/gui/sprites/" + path + ".png"), 0, 0, 6, 6, 6, 6);
        }
        return switch (path) {
            case "hud/hotbar_selection" -> new Region(WIDGETS, 0, 22, 24, 23, 256, 256);
            // 1.20.1's AdvancementTabType.ABOVE: first tab at u 0, middle ones at 28; selected one row (32) down.
            case "advancements/tab_above_left" -> new Region(TABS, 0, 0, 28, 32, 256, 256);
            case "advancements/tab_above_left_selected" -> new Region(TABS, 0, 32, 28, 32, 256, 256);
            case "advancements/tab_above_middle" -> new Region(TABS, 28, 0, 28, 32, 256, 256);
            case "advancements/tab_above_middle_selected" -> new Region(TABS, 28, 32, 28, 32, 256, 256);
            // A sprite without a mapping here is drawn as nothing (and said once) rather than crashing the frame.
            default -> {
                if (MISSING.add(sprite)) dev.agentoffice.mc.core.Ids.LOG.warn("no 1.20.1 texture for sprite {}", sprite);
                yield null;
            }
        };
    }
    *///?}
}
