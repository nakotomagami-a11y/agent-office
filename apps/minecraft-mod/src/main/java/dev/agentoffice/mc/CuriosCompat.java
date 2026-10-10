package dev.agentoffice.mc;

import io.netty.buffer.ByteBuf;
import java.util.List;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.neoforged.fml.ModList;

/**
 * The optional Curios integration, safe to call without Curios installed: Curios types live only in
 * {@link CuriosBridge}, which is never loaded unless {@link #LOADED}.
 */
public final class CuriosCompat {
    public static final boolean LOADED = ModList.get().isLoaded("curios");

    /** One kind of Curios slot ("ring") and how many of it the player has. */
    public record Slots(String id, int count) {
        public static final StreamCodec<ByteBuf, Slots> CODEC = StreamCodec.composite(
                ByteBufCodecs.STRING_UTF8, Slots::id, ByteBufCodecs.VAR_INT, Slots::count, Slots::new);
        public static final StreamCodec<ByteBuf, List<Slots>> LIST = CODEC.apply(ByteBufCodecs.list(MAX_TYPES));
    }

    private static final int MAX_TYPES = 256;
    private static final int MAX_PER_TYPE = 64;

    private CuriosCompat() {}

    /** The player's visible Curios slots in Curios' own order: the shape an agent's panel copies. */
    public static List<Slots> shape(Player player) {
        return LOADED ? bounded(CuriosBridge.shape(player)) : List.of();
    }

    /** Both sides build the menu from this, so their slot numbers line up whatever a pack grants. */
    public static List<Slots> bounded(List<Slots> shape) {
        return shape.stream().limit(MAX_TYPES).map(s -> new Slots(s.id(), Mth.clamp(s.count(), 0, MAX_PER_TYPE))).toList();
    }

    public static boolean accepts(String id, ItemStack stack, Level level) {
        return LOADED && CuriosBridge.accepts(id, stack, level);
    }

    /** The slot's empty-slot picture in the block atlas; null without one. */
    public static ResourceLocation icon(String id, Level level) {
        return LOADED ? CuriosBridge.icon(id, level) : null;
    }
}
