package dev.agentoffice.mc.client;

import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.BodyStore;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.SectionPos;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.neoforged.fml.loading.FMLPaths;

/** Spawns, refreshes and removes the client-only agent bodies of the current world. */
final class Bodies {
    private static final int SYNC_EVERY_TICKS = 10;
    private static final int STATUS_EVERY_TICKS = 100;
    private static final double LOOK_RANGE_SQ = 10 * 10;

    private static BodyStore store;
    private static final Map<String, AgentBody> live = new HashMap<>();
    /** Negative ids can never collide with ids the server hands out. */
    private static int nextId = -1_000_000;
    private static int ticks;
    /** Last known status per body, so a body respawned on chunk reload keeps its nameplate. */
    private static final Map<String, String> lastStatus = new HashMap<>();
    /** Main thread only: never start a poll while the previous one is still waiting on the app. */
    private static boolean polling;

    private Bodies() {}

    static BodyStore store() {
        if (store == null) store = new BodyStore(FMLPaths.CONFIGDIR.get().resolve("agentoffice-bodies.json"));
        return store;
    }

    /** "sp:<save folder>" or "mp:<server address>"; null on the title screen. */
    static String worldKey(Minecraft mc) {
        IntegratedServer sp = mc.getSingleplayerServer();
        if (sp != null) return "sp:" + sp.getWorldPath(LevelResource.ROOT).normalize().getFileName();
        return mc.getCurrentServer() != null ? "mp:" + mc.getCurrentServer().ip : null;
    }

    static boolean placed(Minecraft mc, Api.Slot slot) {
        String world = worldKey(mc);
        return world != null && store().has(world, slot);
    }

    /** Puts the agent where the player is looking (or a few blocks ahead), facing the player. */
    static void place(Minecraft mc, Api.Slot slot) {
        String world = worldKey(mc);
        if (world == null || mc.player == null || mc.level == null) return;
        Vec3 at;
        if (mc.hitResult instanceof BlockHitResult hit && hit.getType() == HitResult.Type.BLOCK) {
            BlockPos pos = hit.getBlockPos().relative(hit.getDirection());
            at = new Vec3(pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5);
        } else {
            // From the body's yaw, not the look vector: looking straight down has no horizontal part.
            at = mc.player.position().add(Vec3.directionFromRotation(0, mc.player.getYRot()).scale(3));
        }
        float yaw = yawTowards(at, mc.player.position());
        store().place(new BodyStore.Body(world, dimension(mc.level), at.x, at.y, at.z, yaw, slot));
        despawn(mc.level, key(slot));
        sync(mc);
    }

    static void dismiss(Minecraft mc, Api.Slot slot) {
        String world = worldKey(mc);
        if (world == null) return;
        store().remove(world, slot);
        if (mc.level != null) despawn(mc.level, key(slot));
    }

    private static final Component SHELL_NAMEPLATE = Component.literal("Unassigned agent").withStyle(ChatFormatting.GRAY)
            .append(Component.literal("  right-click to set up").withStyle(ChatFormatting.YELLOW));

    /** An Agent Spawn Egg used on a block: an unassigned shell stands at {@code at}, facing the player. */
    static void placeShell(Minecraft mc, Vec3 at) {
        String world = worldKey(mc);
        if (world == null || mc.player == null || mc.level == null) return;
        store().place(BodyStore.Body.shell(world, dimension(mc.level), at.x, at.y, at.z, yawTowards(at, mc.player.position())));
        sync(mc);
    }

    static void removeShell(Minecraft mc, String shell) {
        String world = worldKey(mc);
        if (world == null) return;
        store().removeShell(world, shell);
        if (mc.level != null) despawn(mc.level, "shell:" + shell);
    }

    /** Set up: the shell becomes {@code slot}'s body where it stands (that seat's old body, if any, goes). */
    static boolean assignShell(Minecraft mc, String shell, Api.Slot slot) {
        String world = worldKey(mc);
        if (world == null || store().assign(world, shell, slot) == null) return false;
        if (mc.level != null) {
            despawn(mc.level, "shell:" + shell);
            despawn(mc.level, key(slot));
            sync(mc);
        }
        return true;
    }

    static void tick(Minecraft mc) {
        if (mc.level == null || mc.player == null) {
            live.clear();
            lastStatus.clear();
            return;
        }
        ticks++;
        if (ticks % SYNC_EVERY_TICKS == 0) sync(mc);
        if (ticks % STATUS_EVERY_TICKS == 0) refreshStatus(mc);
        for (AgentBody body : live.values()) {
            if (body.distanceToSqr(mc.player) > LOOK_RANGE_SQ) continue;
            float yaw = yawTowards(body.position(), mc.player.position());
            body.setYHeadRot(yaw);
            body.setYBodyRot(yaw);
        }
    }

    private static void sync(Minecraft mc) {
        ClientLevel level = mc.level;
        String world = worldKey(mc);
        if (level == null || world == null) return;
        Set<String> wanted = new HashSet<>();
        for (BodyStore.Body b : store().in(world, dimension(level))) {
            String key = b.key();
            wanted.add(key);
            AgentBody existing = live.get(key);
            if (existing != null && !existing.isRemoved() && existing.level() == level) continue;
            if (!level.hasChunk(SectionPos.blockToSectionCoord(b.x()), SectionPos.blockToSectionCoord(b.z()))) continue;
            AgentBody body = new AgentBody(level, b.slot(), b.shell());
            body.moveTo(b.x(), b.y(), b.z(), b.yaw(), 0);
            body.setYHeadRot(b.yaw());
            body.setYBodyRot(b.yaw());
            body.setCustomName(b.isShell() ? SHELL_NAMEPLATE : nameplate(b.slot(), lastStatus.get(key)));
            // addEntity first removes whatever has that id; never take one another client-side mod uses.
            while (level.getEntity(nextId) != null) nextId--;
            body.setId(nextId--);
            level.addEntity(body);
            // A mod cancelling EntityJoinLevelEvent leaves it out; not tracking it lets the next sync retry.
            if (level.getEntity(body.getId()) == body) live.put(key, body);
        }
        for (String key : Set.copyOf(live.keySet())) {
            if (!wanted.contains(key)) despawn(level, key);
        }
    }

    /**
     * Each visible agent's conversation status for its nameplate. Reads whole conversations;
     * the planned /api/agent-status endpoint (docs/minecraft-mod-plan.md, app change 2) replaces this.
     */
    private static void refreshStatus(Minecraft mc) {
        if (live.values().stream().allMatch(b -> b.slot == null) || polling) return;
        polling = true;
        Map<String, Api.Slot> snapshot = new HashMap<>();
        live.forEach((key, body) -> {
            if (body.slot != null) snapshot.put(key, body.slot); // shells have no conversation
        });
        Connection.client().thenApplyAsync(client -> {
            Map<String, String> found = new HashMap<>();
            snapshot.forEach((key, slot) -> {
                try {
                    found.put(key, client.current(slot).map(Api.Conversation::status).orElse("idle"));
                } catch (Exception e) {
                    found.put(key, "offline");
                }
            });
            return found;
        }, Connection.IO).whenComplete((found, err) -> mc.execute(() -> {
            polling = false;
            for (String key : snapshot.keySet()) {
                String status = err != null ? "offline" : found.get(key);
                lastStatus.put(key, status);
                AgentBody body = live.get(key);
                if (body != null) body.setCustomName(nameplate(body.slot, status));
            }
        }));
    }

    private static Component nameplate(Api.Slot slot, String status) {
        Component name = Component.literal(slot.displayName()).withStyle(ChatFormatting.WHITE);
        if (status == null) return name;
        return switch (status) {
            case "running" -> name.copy().append(Component.literal("  working…").withStyle(ChatFormatting.GOLD));
            case "needs_attention" -> name.copy().append(Component.literal("  needs you!").withStyle(ChatFormatting.RED));
            case "offline" -> name.copy().append(Component.literal("  (Agent Office closed)").withStyle(ChatFormatting.DARK_GRAY));
            default -> name.copy().append(Component.literal("  idle").withStyle(ChatFormatting.GRAY));
        };
    }

    private static void despawn(ClientLevel level, String key) {
        AgentBody body = live.remove(key);
        if (body != null && !body.isRemoved()) level.removeEntity(body.getId(), Entity.RemovalReason.DISCARDED);
    }

    private static String key(Api.Slot slot) {
        return slot.projectId() + "/" + slot.instanceId();
    }

    private static String dimension(ClientLevel level) {
        return level.dimension().location().toString();
    }

    static float yawTowards(Vec3 from, Vec3 to) {
        return (float) (Mth.atan2(to.z - from.z, to.x - from.x) * Mth.RAD_TO_DEG) - 90f;
    }
}
