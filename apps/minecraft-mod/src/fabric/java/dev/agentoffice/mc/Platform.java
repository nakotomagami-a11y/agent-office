package dev.agentoffice.mc;

import dev.agentoffice.mc.compat.CustomPacketPayload;
import dev.agentoffice.mc.compat.StreamCodec;
import io.netty.buffer.ByteBuf;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.networking.v1.PacketByteBufs;
import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.fabricmc.fabric.api.screenhandler.v1.ExtendedScreenHandlerFactory;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.core.BlockPos;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.MenuProvider;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;

/** What shared code asks of the loader, Fabric's answers. NeoForge's are in src/neoforge, same class name. */
public final class Platform {
    private static final Map<ResourceLocation, StreamCodec<ByteBuf, ?>> CODECS = new HashMap<>();

    private Platform() {}

    public static boolean isLoaded(String modId) {
        return FabricLoader.getInstance().isModLoaded(modId);
    }

    public static Path configDir() {
        return FabricLoader.getInstance().getConfigDir();
    }

    /** A dev run (gradlew runClient), where DevHooks may act. */
    public static boolean devRun() {
        return FabricLoader.getInstance().isDevelopmentEnvironment();
    }

    /**
     * Where the player could build. Fabric has no event a land-claim mod answers for any block (NeoForge's
     * EntityPlaceEvent): vanilla's own checks only, spawn protection and adventure mode included.
     */
    static boolean mayBuild(ServerPlayer player, BlockPos pos) {
        return player.mayBuild() && player.level().mayInteract(player, pos);
    }

    /**
     * Bumped with any codec change, as NeoForge's channel version. It is part of every channel id, so mismatched jars
     * see each other as "no mod" (the optional-channel paths) instead of decoding each other's bytes.
     */
    private static final String VERSION = "1";

    /** The Fabric channel of a payload type: {@code agentoffice:place/1}. */
    public static ResourceLocation channel(CustomPacketPayload.Type<?> type) {
        return new ResourceLocation(type.id().getNamespace(), type.id().getPath() + "/" + VERSION);
    }

    /** How each payload is written, both ways (AgentOfficeMod registers them all). */
    static <T extends CustomPacketPayload> void codec(CustomPacketPayload.Type<T> type, StreamCodec<ByteBuf, T> codec) {
        CODECS.put(type.id(), codec);
    }

    /** The payload's bytes, by the codec registered for its type. */
    @SuppressWarnings("unchecked")
    public static FriendlyByteBuf encode(CustomPacketPayload payload) {
        FriendlyByteBuf buf = PacketByteBufs.create();
        ((StreamCodec<ByteBuf, CustomPacketPayload>) CODECS.get(payload.type().id())).encode(buf, payload);
        return buf;
    }

    /** Sent only if the player's client listens on the payload's channel (it joins without the mod too). */
    static void send(ServerPlayer player, CustomPacketPayload payload) {
        ResourceLocation channel = channel(payload.type());
        if (ServerPlayNetworking.canSend(player, channel)) ServerPlayNetworking.send(player, channel, encode(payload));
    }

    /** Opens a menu whose client half is built from what {@code extra} writes (AgentMenu.fromNetwork reads it). */
    static void openMenu(ServerPlayer player, MenuProvider provider, Consumer<FriendlyByteBuf> extra) {
        player.openMenu(new ExtendedScreenHandlerFactory() {
            @Override
            public void writeScreenOpeningData(ServerPlayer p, FriendlyByteBuf buf) {
                extra.accept(buf);
            }

            @Override
            public Component getDisplayName() {
                return provider.getDisplayName();
            }

            @Override
            public AbstractContainerMenu createMenu(int id, Inventory inv, Player p) {
                return provider.createMenu(id, inv, p);
            }
        });
    }

    /**
     * True the first time it is asked for {@code dead}'s kill XP (a revived mob dies again; it pays once). A scoreboard
     * tag: Fabric has no per-entity mod data in 1.20.1; /tag can see it, and an entity with 1024 tags pays nothing.
     */
    public static boolean firstPayout(LivingEntity dead, String key) {
        return dead.addTag(key);
    }

    /** The XP a kill drops (Fabric has no hook for other mods to change it). */
    public static int experienceDrop(LivingEntity dead, int xp) {
        return xp;
    }
}
