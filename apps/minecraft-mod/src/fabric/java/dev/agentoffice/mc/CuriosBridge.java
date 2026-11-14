package dev.agentoffice.mc;

import java.util.List;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/** Curios is NeoForge-only: on Fabric {@link CuriosCompat#LOADED} is false, so none of these is ever called. */
final class CuriosBridge {
    private CuriosBridge() {}

    static List<CuriosCompat.Slots> shape(Player player) {
        return List.of();
    }

    static boolean accepts(String id, ItemStack stack, Level level) {
        return false;
    }

    static ResourceLocation icon(String id, Level level) {
        return null;
    }
}
