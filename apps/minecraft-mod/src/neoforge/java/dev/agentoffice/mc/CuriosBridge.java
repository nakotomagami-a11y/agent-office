package dev.agentoffice.mc;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import top.theillusivec4.curios.api.CuriosApi;
import top.theillusivec4.curios.api.type.ISlotType;
import top.theillusivec4.curios.api.type.capability.ICuriosItemHandler;
import top.theillusivec4.curios.api.type.inventory.ICurioStacksHandler;

/** Curios calls; only {@link CuriosCompat} touches this, and only with Curios loaded. */
final class CuriosBridge {
    private CuriosBridge() {}

    static List<CuriosCompat.Slots> shape(Player player) {
        Map<String, ISlotType> types = CuriosApi.getSlots(player.level());
        Map<String, ICurioStacksHandler> curios = CuriosApi.getCuriosInventory(player).map(ICuriosItemHandler::getCurios).orElse(Map.of());
        return curios.entrySet().stream()
                .filter(e -> e.getValue().isVisible() && e.getValue().getSlots() > 0 && types.containsKey(e.getKey()))
                .sorted(Comparator.comparingInt((Map.Entry<String, ICurioStacksHandler> e) -> types.get(e.getKey()).getOrder())
                        .thenComparing(Map.Entry::getKey))
                .map(e -> new CuriosCompat.Slots(e.getKey(), e.getValue().getSlots()))
                .toList();
    }

    static boolean accepts(String id, ItemStack stack, Level level) {
        return CuriosApi.getItemStackSlots(stack, level).containsKey(id);
    }

    static ResourceLocation icon(String id, Level level) {
        return CuriosApi.getSlot(id, level).map(ISlotType::getIcon).orElse(null);
    }
}
