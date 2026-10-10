package dev.agentoffice.mc.client;

import dev.agentoffice.mc.AgentMenu;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.Slot;

/**
 * An agent's inventory in vanilla's own look: a chest-like window (its 27 slots and hotbar over the player's
 * inventory), its armor, offhand and a preview in a panel to the right, its Curios slots in one to the left.
 * Side panels, not a taller window: an auto GUI scale only promises 240 of height, and plenty of width.
 */
final class AgentInventoryScreen extends AbstractContainerScreen<AgentMenu> {
    private static final ResourceLocation CHEST = ResourceLocation.withDefaultNamespace("textures/gui/container/generic_54.png");
    private static final ResourceLocation HAND = ResourceLocation.withDefaultNamespace("hud/hotbar_selection");
    /** generic_54.png: title strip and three rows, then the player's part from v=126. */
    private static final int ROWS_END = 71;
    private static final int PLAYER_PART_Y = AgentMenu.AGENT_HOTBAR_Y + 17;
    private static final int PANEL = 0xFFC6C6C6;
    private static final int GAP = 2;
    /** Right panel: armor column, then the preview box. */
    private static final int EQUIPMENT_WIDTH = 7 + 18 + 2 + 51 + 7;
    private static final int EQUIPMENT_HEIGHT = 84 + 18 + 7;

    AgentInventoryScreen(AgentMenu menu, Inventory inventory, Component title) {
        super(menu, inventory, title);
        imageHeight = PLAYER_PART_Y + 96;
        inventoryLabelY = imageHeight - 94;
    }

    private int curiosColumns() {
        long total = menu.slots.stream().filter(s -> s instanceof AgentMenu.CurioSlot).count();
        return (int) ((total + 8) / 9);
    }

    private int curiosRows() {
        return (int) Math.min(9, menu.slots.stream().filter(s -> s instanceof AgentMenu.CurioSlot).count());
    }

    private int curiosWidth() {
        return menu.curios.isEmpty() ? 0 : curiosColumns() * 18 + 14;
    }

    @Override
    protected void init() {
        super.init();
        // Centre the window with both side panels.
        int total = curiosWidth() + (menu.curios.isEmpty() ? 0 : GAP) + imageWidth + GAP + EQUIPMENT_WIDTH;
        leftPos = (width - total) / 2 + curiosWidth() + (menu.curios.isEmpty() ? 0 : GAP);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick);
        renderTooltip(g, mouseX, mouseY);
    }

    @Override
    protected void renderTooltip(GuiGraphics g, int mouseX, int mouseY) {
        if (menu.getCarried().isEmpty() && hoveredSlot instanceof AgentMenu.CurioSlot slot && !slot.hasItem()) {
            // Curios' own name for the slot ("Ring"), as its screen shows.
            g.renderTooltip(font, Component.translatable("curios.identifier." + slot.id), mouseX, mouseY);
            return;
        }
        super.renderTooltip(g, mouseX, mouseY);
    }

    @Override
    protected void renderBg(GuiGraphics g, float partialTick, int mouseX, int mouseY) {
        int x = leftPos;
        int y = topPos;
        g.blit(CHEST, x, y, 0, 0, imageWidth, ROWS_END);
        g.blit(CHEST, x, y + ROWS_END, 0, 6, imageWidth, 4); // plain panel: the gap above its hotbar
        g.blit(CHEST, x, y + AgentMenu.AGENT_HOTBAR_Y - 1, 0, 17, imageWidth, 18);
        g.blit(CHEST, x, y + PLAYER_PART_Y, 0, 126, imageWidth, 96);
        // Its hotbar's first slot is what it holds, like the player's selected slot.
        Slot hand = menu.getSlot(AgentMenu.HOTBAR);
        g.blitSprite(HAND, x + hand.x - 4, y + hand.y - 4, 24, 23);

        int ex = x + imageWidth + GAP;
        panel(g, ex, y, ex + EQUIPMENT_WIDTH, y + EQUIPMENT_HEIGHT);
        for (int i = AgentMenu.ARMOR; i <= AgentMenu.OFFHAND; i++) well(g, x + menu.getSlot(i).x, y + menu.getSlot(i).y, 16, 16);
        int px = x + AgentMenu.EQUIPMENT_X + 18 + 2;
        well(g, px, y + 8, 49, 70);
        g.fill(px, y + 8, px + 49, y + 78, 0xFF000000);
        if (menu.agent != null) {
            // The preview is no place for its nameplate (shown while visible, or named and looked at).
            Component name = menu.agent.getCustomName();
            boolean visible = menu.agent.isCustomNameVisible();
            menu.agent.setCustomName(null);
            menu.agent.setCustomNameVisible(false);
            InventoryScreen.renderEntityInInventoryFollowsMouse(g, px, y + 8, px + 49, y + 78, 30, 0.0625f, mouseX, mouseY, menu.agent);
            menu.agent.setCustomName(name);
            menu.agent.setCustomNameVisible(visible);
        }

        if (!menu.curios.isEmpty()) {
            panel(g, x - GAP - curiosWidth(), y, x - GAP, y + curiosRows() * 18 + 14);
            for (Slot s : menu.slots) {
                if (s instanceof AgentMenu.CurioSlot) well(g, x + s.x, y + s.y, 16, 16);
            }
        }
    }

    /** Vanilla's window edge: black outline with cut corners, light top-left, dark bottom-right. */
    private static void panel(GuiGraphics g, int x0, int y0, int x1, int y1) {
        g.fill(x0 + 1, y0, x1 - 1, y1, 0xFF000000);
        g.fill(x0, y0 + 1, x1, y1 - 1, 0xFF000000);
        g.fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, PANEL);
        g.fill(x0 + 1, y0 + 1, x1 - 3, y0 + 3, 0xFFFFFFFF);
        g.fill(x0 + 1, y0 + 1, x0 + 3, y1 - 3, 0xFFFFFFFF);
        g.fill(x0 + 3, y1 - 3, x1 - 1, y1 - 1, 0xFF555555);
        g.fill(x1 - 3, y0 + 3, x1 - 1, y1 - 1, 0xFF555555);
    }

    /** A slot's sunken look around a {@code w}×{@code h} inside. */
    private static void well(GuiGraphics g, int x, int y, int w, int h) {
        g.fill(x - 1, y - 1, x + w + 1, y + h + 1, 0xFF373737);
        g.fill(x, y, x + w + 1, y + h + 1, 0xFFFFFFFF);
        g.fill(x, y, x + w, y + h, 0xFF8B8B8B);
    }

    @Override
    protected void renderLabels(GuiGraphics g, int mouseX, int mouseY) {
        g.drawString(font, font.plainSubstrByWidth(title.getString(), imageWidth - 16), titleLabelX, titleLabelY, 0x404040, false);
        g.drawString(font, playerInventoryTitle, inventoryLabelX, inventoryLabelY, 0x404040, false);
    }

    /** The side panels are part of the window: a click on one must not throw the carried stack out. */
    @Override
    protected boolean hasClickedOutside(double mouseX, double mouseY, int left, int top, int button) {
        boolean onEquipment = mouseX >= left + imageWidth && mouseX < left + imageWidth + GAP + EQUIPMENT_WIDTH
                && mouseY >= top && mouseY < top + EQUIPMENT_HEIGHT;
        boolean onCurios = mouseX >= left - GAP - curiosWidth() && mouseX < left && mouseY >= top && mouseY < top + curiosRows() * 18 + 14;
        return !onEquipment && !onCurios && super.hasClickedOutside(mouseX, mouseY, left, top, button);
    }
}
