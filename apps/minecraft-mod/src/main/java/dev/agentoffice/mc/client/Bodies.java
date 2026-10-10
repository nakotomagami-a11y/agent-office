package dev.agentoffice.mc.client;

import dev.agentoffice.mc.AgentEntity;
import dev.agentoffice.mc.AgentNet;
import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.BodyStore;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.neoforged.fml.loading.FMLPaths;
import net.neoforged.neoforge.network.PacketDistributor;

/**
 * The player's agent bodies as this client sees them. The bodies are entities the world owns
 * ({@link AgentEntity}); this asks the world to place, retarget and dismiss them, keeps the list of
 * seats it says this player has placed, and shows each visible body's status on its nameplate.
 */
final class Bodies {
    private static final int STATUS_EVERY_TICKS = 100;

    /** From the world: this player's agents. Empty on a server without the mod. */
    private static List<AgentNet.Body> placed = List.of();
    /** Joined a world; its first list (sent once the player stands somewhere) starts the migration clock. */
    private static boolean joining;
    /** Ticks until old bodies are sent: the chunks around the player load first (the world never loads one for them). */
    private static int migrateIn;
    private static final int MIGRATE_AFTER_TICKS = 100;
    /** Sent and not yet answered; the next list says which the world took. */
    private static List<BodyStore.Body> migrating = List.of();
    private static String migratingWorld;
    private static BodyStore legacy;
    private static int ticks;
    /** Main thread only: never start a poll while the previous one is still waiting on the app. */
    private static boolean polling;

    private Bodies() {}

    /** Where bodies lived before they were entities; each is handed to the world near it, then forgotten. */
    private static BodyStore legacy() {
        if (legacy == null) legacy = new BodyStore(FMLPaths.CONFIGDIR.get().resolve("agentoffice-bodies.json"));
        return legacy;
    }

    /** "sp:<save folder>" or "mp:<server address>"; null on the title screen. */
    static String worldKey(Minecraft mc) {
        IntegratedServer sp = mc.getSingleplayerServer();
        if (sp != null) return "sp:" + sp.getWorldPath(LevelResource.ROOT).normalize().getFileName();
        return mc.getCurrentServer() != null ? "mp:" + mc.getCurrentServer().ip : null;
    }

    /** The world runs Agent Office too (always in singleplayer); without it there are no bodies. */
    static boolean available(Minecraft mc) {
        ClientPacketListener conn = mc.getConnection();
        return conn != null && conn.hasChannel(AgentNet.Place.TYPE);
    }

    static void onPlaced(List<AgentNet.Body> bodies) {
        placed = List.copyOf(bodies);
        Minecraft mc = Minecraft.getInstance();
        // An old body is forgotten only once the world has that agent; one it refused waits for another join.
        for (BodyStore.Body b : migrating) {
            if (seatOf(mc, b.slot()) != null) legacy().remove(migratingWorld, b.slot());
        }
        migrating = List.of();
        if (joining) {
            joining = false;
            migrateIn = MIGRATE_AFTER_TICKS;
        }
    }

    static void joined() {
        joining = true;
    }

    /**
     * Bodies placed in this world before they were entities, near the player in this dimension, are handed to
     * the world (which skips agents it already has); the rest wait for a join that finds the player near them.
     * Old shells are dropped: an egg makes a new one.
     */
    private static void migrate(Minecraft mc) {
        String world = worldKey(mc);
        if (world == null || mc.player == null || mc.level == null || !available(mc)) return;
        String dimension = mc.level.dimension().location().toString();
        double range = AgentNet.MIGRATE_RANGE - 8; // the server measures from where it has the player
        // Dropped quietly: shells (an egg makes a new one) and seats whose ids no world can take.
        for (BodyStore.Body b : legacy().in(world)) {
            if (b.isShell()) legacy().removeShell(world, b.shell());
            else if (tooLong(b.slot())) legacy().remove(world, b.slot());
        }
        List<BodyStore.Body> near = legacy().in(world).stream()
                .filter(b -> b.dimension().equals(dimension) && mc.player.position().distanceToSqr(b.x(), b.y(), b.z()) <= range * range)
                .limit(AgentNet.MAX_AGENTS).toList();
        if (near.isEmpty()) return;
        migrating = near;
        migratingWorld = world;
        PacketDistributor.sendToServer(new AgentNet.Migrate(
                near.stream().map(b -> new AgentNet.Legacy(wire(mc, b.slot()), b.x(), b.y(), b.z(), b.yaw())).toList()));
    }

    static void left() {
        placed = List.of();
        joining = false;
        migrateIn = 0;
        migrating = List.of();
    }

    /**
     * A seat as the world takes it: at most {@link AgentNet#MAX_TEXT} characters a field. Names are only shown,
     * so they are cut; an id that long can't be sent (null, and the player is told).
     */
    private static Api.Slot wire(Minecraft mc, Api.Slot s) {
        if (tooLong(s)) {
            mc.gui.setOverlayMessage(Component.literal(s.displayName() + "'s ids are too long to stand in a world"), false);
            return null;
        }
        return new Api.Slot(s.projectId(), cut(s.projectName(), AgentNet.MAX_TEXT), s.agentId(), s.instanceId(), cut(s.label(), AgentNet.MAX_TEXT));
    }

    private static boolean tooLong(Api.Slot s) {
        int max = AgentNet.MAX_TEXT;
        return s.projectId().length() > max || s.agentId().length() > max || s.instanceId().length() > max;
    }

    private static String cut(String text, int max) {
        return text == null || text.length() <= max ? text : text.substring(0, max);
    }

    static boolean placed(Minecraft mc, Api.Slot slot) {
        return seatOf(mc, slot) != null;
    }

    /** Which seat the body of {@code anySeat}'s agent talks to in this world; null if it has none here. */
    static Api.Slot seatOf(Minecraft mc, Api.Slot anySeat) {
        return placed.stream().map(AgentNet.Body::seat)
                .filter(s -> s.projectId().equals(anySeat.projectId()) && s.agentId().equals(anySeat.agentId()))
                .findFirst().orElse(null);
    }

    /** The seat this player's {@code body} talks to; null if it is a shell or someone else's. */
    static Api.Slot seatOf(AgentEntity body) {
        return placed.stream().filter(b -> b.entity().filter(body.getUUID()::equals).isPresent())
                .map(AgentNet.Body::seat).findFirst().orElse(null);
    }

    private static boolean checkAvailable(Minecraft mc) {
        if (available(mc)) return true;
        mc.gui.setOverlayMessage(Component.literal("Agents can't stand in this world: its server doesn't have Agent Office installed"), false);
        return false;
    }

    /** Puts the agent where the player is looking (or a few blocks ahead), facing the player. */
    static void place(Minecraft mc, Api.Slot slot) {
        Api.Slot seat = mc.player == null || !checkAvailable(mc) ? null : wire(mc, slot);
        if (seat == null) return;
        Vec3 at;
        if (mc.hitResult instanceof BlockHitResult hit && hit.getType() == HitResult.Type.BLOCK) {
            BlockPos pos = hit.getBlockPos().relative(hit.getDirection());
            at = new Vec3(pos.getX() + 0.5, pos.getY(), pos.getZ() + 0.5);
        } else {
            // From the body's yaw, not the look vector: looking straight down has no horizontal part.
            at = mc.player.position().add(Vec3.directionFromRotation(0, mc.player.getYRot()).scale(3));
        }
        PacketDistributor.sendToServer(new AgentNet.Place(seat, at.x, at.y, at.z, AgentEntity.yawTowards(at, mc.player.position())));
    }

    /** The agent's body in this world talks to {@code slot} from now on (its nameplate and status follow). */
    static void switchSeat(Minecraft mc, Api.Slot slot) {
        Api.Slot seat = available(mc) ? wire(mc, slot) : null;
        if (seat != null) PacketDistributor.sendToServer(new AgentNet.Retarget(seat));
    }

    /** Its body goes and what it held comes back to the player; the agent and its chat stay in Agent Office. */
    static void dismiss(Minecraft mc, Api.Slot slot) {
        Api.Slot seat = available(mc) ? wire(mc, slot) : null;
        if (seat != null) PacketDistributor.sendToServer(new AgentNet.Dismiss(seat));
    }

    /** {@code slot} is gone from Agent Office: its agent's body goes too, unless it talks to another seat. */
    static void seatRemoved(Minecraft mc, Api.Slot slot) {
        Api.Slot standing = seatOf(mc, slot);
        if (standing != null && standing.instanceId().equals(slot.instanceId())) dismiss(mc, slot);
    }

    static void removeShell(Minecraft mc, UUID shell) {
        if (available(mc)) PacketDistributor.sendToServer(new AgentNet.RemoveShell(shell));
    }

    /** Set up: the shell becomes the body of {@code slot}'s agent where it stands. False if the shell is gone. */
    static boolean assignShell(Minecraft mc, UUID shell, Api.Slot slot) {
        Api.Slot seat = mc.level == null || !available(mc) || find(mc, shell) == null ? null : wire(mc, slot);
        if (seat == null) return false;
        PacketDistributor.sendToServer(new AgentNet.AssignShell(shell, seat));
        return true;
    }

    private static AgentEntity find(Minecraft mc, UUID id) {
        for (Entity e : mc.level.entitiesForRendering()) {
            if (e instanceof AgentEntity a && a.getUUID().equals(id)) return a;
        }
        return null;
    }

    static void tick(Minecraft mc) {
        if (mc.level == null || mc.player == null) return;
        if (++ticks % STATUS_EVERY_TICKS == 0) refreshStatus(mc);
        if (migrateIn > 0 && --migrateIn == 0) migrate(mc);
    }

    /**
     * Each of this player's visible agents' conversation status, shown on its nameplate here only (other
     * players see its plain name). Reads whole conversations; the planned /api/agent-status endpoint
     * (docs/minecraft-mod-plan.md, app change 2) replaces this.
     */
    private static void refreshStatus(Minecraft mc) {
        if (polling) return;
        Map<AgentEntity, Api.Slot> snapshot = new HashMap<>();
        for (Entity e : mc.level.entitiesForRendering()) {
            if (e instanceof AgentEntity a && seatOf(a) != null) snapshot.put(a, seatOf(a));
        }
        if (snapshot.isEmpty()) return;
        polling = true;
        Connection.client().thenApplyAsync(client -> {
            Map<AgentEntity, String> found = new HashMap<>();
            snapshot.forEach((body, slot) -> {
                try {
                    found.put(body, client.current(slot).map(Api.Conversation::status).orElse("idle"));
                } catch (Exception e) {
                    found.put(body, "offline");
                }
            });
            return found;
        }, Connection.IO).whenComplete((found, err) -> mc.execute(() -> {
            polling = false;
            snapshot.forEach((body, slot) -> {
                // Switched to another seat meanwhile: this status is the old seat's.
                if (body.isRemoved() || !slot.equals(seatOf(body))) return;
                body.setCustomName(nameplate(slot, err != null ? "offline" : found.get(body)));
            });
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
}
