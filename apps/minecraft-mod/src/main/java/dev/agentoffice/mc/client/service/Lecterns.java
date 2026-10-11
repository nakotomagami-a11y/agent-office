package dev.agentoffice.mc.client.service;

import dev.agentoffice.mc.ModPaths;
import dev.agentoffice.mc.client.screen.LecternSetupScreen;
import dev.agentoffice.mc.client.screen.ReviewScreen;
import dev.agentoffice.mc.core.LecternStore;
import java.util.Optional;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;

/** Review Lecterns on this client: which project each one shows, and opening one. */
public final class Lecterns {
    private static LecternStore store;
    /** Main thread only: one pending open at a time, however fast the player clicks. */
    private static boolean opening;

    private Lecterns() {}

    public static LecternStore store() {
        if (store == null) store = new LecternStore(ModPaths.lecterns());
        return store;
    }

    /** Null on the title screen. */
    public static String key(Minecraft mc, BlockPos pos) {
        String world = Bodies.worldKey(mc);
        if (world == null || mc.level == null) return null;
        return LecternStore.key(world, mc.level.dimension().location().toString(), pos.getX(), pos.getY(), pos.getZ());
    }

    /** A bound lectern opens its review queue; an unbound one (or a sneak-use) asks what to show first. */
    public static void open(Minecraft mc, BlockPos pos, boolean rebind) {
        String key = key(mc, pos);
        if (key == null || mc.screen != null || opening) return;
        Optional<LecternStore.Binding> binding = rebind ? Optional.empty() : store().get(key);
        opening = true;
        AgentOffice.client().whenComplete((client, err) -> mc.execute(() -> {
            opening = false;
            if (err != null) {
                mc.gui.setOverlayMessage(Component.literal("Agent Office isn't running"), false);
            } else if (mc.screen == null && mc.level != null) {
                mc.setScreen(binding.isPresent() ? new ReviewScreen(client, binding.get(), key) : new LecternSetupScreen(client, key, null));
            }
        }));
    }
}
