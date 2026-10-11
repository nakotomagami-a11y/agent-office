package dev.agentoffice.mc.client.service;

import dev.agentoffice.mc.AgentEntity;
import dev.agentoffice.mc.AgentNet;
import dev.agentoffice.mc.AgentPayloads;
import dev.agentoffice.mc.Tuning;
import dev.agentoffice.mc.core.AgentState;
import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.LecternStore;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
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
import net.neoforged.neoforge.network.PacketDistributor;

/**
 * The player's agent bodies as this client sees them. The bodies are entities the world owns
 * ({@link AgentEntity}); this asks the world to place, retarget and dismiss them, keeps the list of
 * seats it says this player has placed, and tells the world which of them work (from {@link AgentStatus}).
 */
public final class Bodies {

    /** From the world: this player's agents. Empty on a server without the mod. */
    private static List<AgentPayloads.Body> placed = List.of();
    private static int ticks;
    /** When the last report went: the world drops one that comes sooner than Tuning.STATUS_MIN_TICKS after it. */
    private static int reportedAt = -Tuning.STATUS_MIN_TICKS;

    private Bodies() {}

    /** "sp:<save folder>" or "mp:<server address>"; null on the title screen. */
    static String worldKey(Minecraft mc) {
        IntegratedServer sp = mc.getSingleplayerServer();
        if (sp != null) return "sp:" + sp.getWorldPath(LevelResource.ROOT).normalize().getFileName();
        return mc.getCurrentServer() != null ? "mp:" + mc.getCurrentServer().ip : null;
    }

    /** The world runs Agent Office too (always in singleplayer); without it there are no bodies. */
    static boolean available(Minecraft mc) {
        ClientPacketListener conn = mc.getConnection();
        return conn != null && conn.hasChannel(AgentPayloads.Place.TYPE);
    }

    public static void onPlaced(List<AgentPayloads.Body> bodies) {
        placed = List.copyOf(bodies);
    }

    /** XP of this player's agents, by entity, as the world last said; for their level. */
    private static final Map<UUID, Integer> xp = new HashMap<>();

    public static void onStats(AgentPayloads.Stats stats) {
        xp.put(stats.entity(), stats.xp());
    }

    /** Null until the world says (an older server never does). */
    public static Integer xpOf(AgentEntity body) {
        return xp.get(body.getUUID());
    }

    public static void left() {
        placed = List.of();
        xp.clear();
        AgentStatus.unwatch(Bodies.class);
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
        return new Api.Slot(s.projectId(), cut(s.projectName(), AgentPayloads.MAX_TEXT), s.agentId(), s.instanceId(), cut(s.label(), AgentPayloads.MAX_TEXT));
    }

    private static boolean tooLong(Api.Slot s) {
        int max = AgentPayloads.MAX_TEXT;
        return s.projectId().length() > max || s.agentId().length() > max || s.instanceId().length() > max;
    }

    private static String cut(String text, int max) {
        return text == null || text.length() <= max ? text : text.substring(0, max);
    }

    public static boolean placed(Minecraft mc, Api.Slot slot) {
        return seatOf(mc, slot) != null;
    }

    /** Which seat the body of {@code anySeat}'s agent talks to in this world; null if it has none here. */
    public static Api.Slot seatOf(Minecraft mc, Api.Slot anySeat) {
        return placed.stream().map(AgentPayloads.Body::seat)
                .filter(s -> s.projectId().equals(anySeat.projectId()) && s.agentId().equals(anySeat.agentId()))
                .findFirst().orElse(null);
    }

    /** The seat this player's {@code body} talks to; null if it is a shell or someone else's. */
    public static Api.Slot seatOf(AgentEntity body) {
        return placed.stream().filter(b -> b.entity().filter(body.getUUID()::equals).isPresent())
                .map(AgentPayloads.Body::seat).findFirst().orElse(null);
    }

    private static boolean checkAvailable(Minecraft mc) {
        if (available(mc)) return true;
        mc.gui.setOverlayMessage(Component.literal("Agents can't stand in this world: its server doesn't have Agent Office installed"), false);
        return false;
    }

    /** Puts the agent where the player is looking (or a few blocks ahead), facing the player. */
    public static void place(Minecraft mc, Api.Slot slot) {
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
        PacketDistributor.sendToServer(new AgentPayloads.Place(seat, at.x, at.y, at.z, AgentEntity.yawTowards(at, mc.player.position())));
    }

    /** The agent's body in this world talks to {@code slot} from now on (its nameplate and status follow). */
    public static void switchSeat(Minecraft mc, Api.Slot slot) {
        Api.Slot seat = available(mc) ? wire(mc, slot) : null;
        if (seat != null) PacketDistributor.sendToServer(new AgentPayloads.Retarget(seat));
    }

    /** Its body goes and what it held comes back to the player; the agent and its chat stay in Agent Office. */
    public static void dismiss(Minecraft mc, Api.Slot slot) {
        Api.Slot seat = available(mc) ? wire(mc, slot) : null;
        if (seat != null) PacketDistributor.sendToServer(new AgentPayloads.Dismiss(seat));
    }

    /** {@code slot} is gone from Agent Office: its agent's body goes too, unless it talks to another seat. */
    public static void seatRemoved(Minecraft mc, Api.Slot slot) {
        Api.Slot standing = seatOf(mc, slot);
        if (standing != null && standing.instanceId().equals(slot.instanceId())) dismiss(mc, slot);
    }

    public static void removeShell(Minecraft mc, UUID shell) {
        if (available(mc)) PacketDistributor.sendToServer(new AgentPayloads.RemoveShell(shell));
    }

    /** Set up: the shell becomes the body of {@code slot}'s agent where it stands. False if the shell is gone. */
    public static boolean assignShell(Minecraft mc, UUID shell, Api.Slot slot) {
        Api.Slot seat = mc.level == null || !available(mc) || find(mc, shell) == null ? null : wire(mc, slot);
        if (seat == null) return false;
        PacketDistributor.sendToServer(new AgentPayloads.AssignShell(shell, seat));
        return true;
    }

    private static AgentEntity find(Minecraft mc, UUID id) {
        for (Entity e : mc.level.entitiesForRendering()) {
            if (e instanceof AgentEntity a && a.getUUID().equals(id)) return a;
        }
        return null;
    }

    /** Every round: the visible agents this player owns are the ones whose status matters here. */
    public static void tick(Minecraft mc) {
        if (mc.level == null || mc.player == null) return;
        if (++ticks % Tuning.STATUS_REPORT_TICKS == 0) AgentStatus.watch(Bodies.class, visible(mc).values());
    }

    private static Map<AgentEntity, Api.Slot> visible(Minecraft mc) {
        Map<AgentEntity, Api.Slot> out = new HashMap<>();
        if (mc.level == null) return out;
        for (Entity e : mc.level.entitiesForRendering()) {
            if (e instanceof AgentEntity a && seatOf(a) != null) out.put(a, seatOf(a));
        }
        return out;
    }

    /**
     * After each status round: the world is told which agents work and at which lectern, so their bodies go there (a
     * server can't ask Agent Office itself), and the name each is known by. Waiting on its owner counts as working:
     * it stays at its desk.
     */
    public static void report() {
        Minecraft mc = Minecraft.getInstance();
        // One tick spare: the server counts its own ticks, which may run a little ahead of ours.
        if (mc.level == null || !available(mc) || ticks - reportedAt <= Tuning.STATUS_MIN_TICKS) return;
        List<AgentPayloads.Work> work = new ArrayList<>();
        visible(mc).forEach((body, slot) -> {
            // Only what this asked about: a round a screen started may not have asked about this body yet.
            AgentState state = AgentStatus.watches(Bodies.class, slot) ? AgentStatus.of(slot) : null;
            if (state == null) return;
            boolean working = state.atWork();
            work.add(new AgentPayloads.Work(body.getUUID(), working, working ? lectern(mc, body, slot) : Optional.empty(), cut(slot.displayName(), AgentPayloads.MAX_TEXT)));
        });
        if (work.isEmpty()) return;
        reportedAt = ticks;
        PacketDistributor.sendToServer(new AgentPayloads.Status(work));
    }

    /** Its desk: the nearest lectern showing its project (or all projects), else the nearest bound one at all. */
    private static Optional<BlockPos> lectern(Minecraft mc, AgentEntity body, Api.Slot slot) {
        String world = worldKey(mc);
        if (world == null || mc.level == null) return Optional.empty();
        double range = AgentNet.LECTERN_RANGE - 1;
        List<LecternStore.At> near = Lecterns.store().in(world, mc.level.dimension().location().toString()).stream()
                .filter(l -> body.distanceToSqr(l.x() + 0.5, l.y() + 0.5, l.z() + 0.5) <= range * range).toList();
        Comparator<LecternStore.At> nearest = Comparator.comparingDouble(l -> body.distanceToSqr(l.x() + 0.5, l.y() + 0.5, l.z() + 0.5));
        Optional<LecternStore.At> own = near.stream()
                .filter(l -> l.binding().all() || l.binding().projectId().equals(slot.projectId())).min(nearest);
        return own.or(() -> near.stream().min(nearest)).map(l -> new BlockPos(l.x(), l.y(), l.z()));
    }
}
