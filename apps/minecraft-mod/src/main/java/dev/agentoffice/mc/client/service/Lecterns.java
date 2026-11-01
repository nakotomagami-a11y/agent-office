package dev.agentoffice.mc.client.service;

import dev.agentoffice.mc.ModPaths;
import dev.agentoffice.mc.client.screen.LecternSetupScreen;
import dev.agentoffice.mc.client.screen.ReviewScreen;
import dev.agentoffice.mc.core.LecternStore;
import java.util.Optional;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;

/** Review Lecterns on this client: which project each one shows, and opening one. */
public final class Lecterns {
    private static LecternStore store;

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
        if (key == null || mc.screen != null) return;
        Optional<LecternStore.Binding> binding = rebind ? Optional.empty() : store().get(key);
        AgentOffice.openWhenConnected(client ->
                binding.isPresent() ? new ReviewScreen(client, binding.get(), key) : new LecternSetupScreen(client, key, null));
    }
}
