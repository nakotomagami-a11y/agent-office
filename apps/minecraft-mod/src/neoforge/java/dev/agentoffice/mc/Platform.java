package dev.agentoffice.mc;

import java.nio.file.Path;
import java.util.function.Consumer;
import net.minecraft.core.BlockPos;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.MenuProvider;
import net.minecraft.world.entity.LivingEntity;
import net.neoforged.fml.ModList;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.fml.loading.FMLPaths;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.common.util.BlockSnapshot;
import net.neoforged.neoforge.event.EventHooks;
import net.neoforged.neoforge.event.level.BlockEvent;
import net.neoforged.neoforge.network.PacketDistributor;

/** What shared code asks of the loader, NeoForge's answers. Fabric's are in src/fabric, same class name. */
public final class Platform {
    private Platform() {}

    public static boolean isLoaded(String modId) {
        return ModList.get().isLoaded(modId);
    }

    public static Path configDir() {
        return FMLPaths.CONFIGDIR.get();
    }

    /** A dev run (gradlew runClient), where DevHooks may act. */
    public static boolean devRun() {
        return !FMLEnvironment.production;
    }

    /** As if the player put something at {@code pos}: land-claim mods refuse it where the player may not build. */
    static boolean mayBuild(ServerPlayer player, BlockPos pos) {
        ServerLevel level = player.serverLevel();
        return !NeoForge.EVENT_BUS.post(new BlockEvent.EntityPlaceEvent(BlockSnapshot.create(level.dimension(), level, pos),
                level.getBlockState(pos.below()), player)).isCanceled();
    }

    /** Sent only if the player's client has the mod's channel (it joins without the mod too). */
    static void send(ServerPlayer player, CustomPacketPayload payload) {
        if (player.connection.hasChannel(payload.type())) PacketDistributor.sendToPlayer(player, payload);
    }

    /** Opens a menu whose client half is built from what {@code extra} writes (AgentMenu.fromNetwork reads it). */
    static void openMenu(ServerPlayer player, MenuProvider provider, Consumer<RegistryFriendlyByteBuf> extra) {
        player.openMenu(provider, extra);
    }

    /** True the first time it is asked for {@code dead}'s kill XP (a revived mob dies again; it pays once). */
    public static boolean firstPayout(LivingEntity dead, String key) {
        if (dead.getPersistentData().getBoolean(key)) return false;
        dead.getPersistentData().putBoolean(key, true);
        return true;
    }

    /** The XP a kill drops after other mods had their say. */
    public static int experienceDrop(LivingEntity dead, int xp) {
        return EventHooks.getExperienceDrop(dead, null, xp);
    }
}
