package dev.agentoffice.mc.client;

import dev.agentoffice.mc.core.LecternStore;
import java.util.Optional;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.neoforged.fml.loading.FMLPaths;

/** Review Lecterns on this client: which project each one shows, and opening one. */
final class Lecterns {
    private static LecternStore store;
    /** Main thread only: one pending open at a time, however fast the player clicks. */
    private static boolean opening;

    private Lecterns() {}

    static LecternStore store() {
        if (store == null) store = new LecternStore(FMLPaths.CONFIGDIR.get().resolve("agentoffice-lecterns.json"));
        return store;
    }

    /** Null on the title screen. */
    static String key(Minecraft mc, BlockPos pos) {
        String world = Bodies.worldKey(mc);
        if (world == null || mc.level == null) return null;
        return LecternStore.key(world, mc.level.dimension().location().toString(), pos.getX(), pos.getY(), pos.getZ());
    }

    /** A bound lectern opens its review queue; an unbound one (or a sneak-use) asks what to show first. */
    static void open(Minecraft mc, BlockPos pos, boolean rebind) {
        String key = key(mc, pos);
        if (key == null || mc.screen != null || opening) return;
        Optional<LecternStore.Binding> binding = rebind ? Optional.empty() : store().get(key);
        opening = true;
        Connection.client().whenComplete((client, err) -> mc.execute(() -> {
            opening = false;
            if (err != null) {
                mc.gui.setOverlayMessage(Component.literal("Agent Office isn't running"), false);
            } else if (mc.screen == null && mc.level != null) {
                mc.setScreen(binding.isPresent() ? new ReviewScreen(client, binding.get(), key) : new LecternSetupScreen(client, key, null));
            }
        }));
    }
}
