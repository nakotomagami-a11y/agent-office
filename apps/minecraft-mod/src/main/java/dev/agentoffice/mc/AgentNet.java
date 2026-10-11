package dev.agentoffice.mc;

import dev.agentoffice.mc.AgentPayloads.Place;
import dev.agentoffice.mc.AgentPayloads.Retarget;
import dev.agentoffice.mc.AgentPayloads.Dismiss;
import dev.agentoffice.mc.AgentPayloads.AssignShell;
import dev.agentoffice.mc.AgentPayloads.RemoveShell;
import dev.agentoffice.mc.AgentPayloads.Migrate;
import dev.agentoffice.mc.AgentPayloads.Work;
import dev.agentoffice.mc.AgentPayloads.Stats;
import dev.agentoffice.mc.AgentPayloads.Status;
import dev.agentoffice.mc.AgentPayloads.Body;
import dev.agentoffice.mc.AgentPayloads.Placed;
import dev.agentoffice.mc.core.Api;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.common.util.BlockSnapshot;
import net.neoforged.neoforge.event.level.BlockEvent;
import net.neoforged.neoforge.network.PacketDistributor;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;

/**
 * What the tablet asks of the world (place, switch seat, dismiss, set up or remove a shell, report work),
 * and the list of a player's placed agents that the world sends back. Optional channels: the client still
 * joins a server without the mod, where it just can't place agents.
 *
 * Any client can send these, a modified one included: every handler checks ownership, reach and limits.
 */
public final class AgentNet {
    /** Set by the client setup; this class must not reference client classes itself. */
    public static Consumer<List<Body>> onPlaced = bodies -> { };
    public static Consumer<Stats> onStats = stats -> { };

    private static final double REACH = 32;
    private static final int COOLDOWN_TICKS = 4;
    /** How far from its body an agent's lectern may be. */
    public static final double LECTERN_RANGE = 64;

    private AgentNet() {}

    static void register(RegisterPayloadHandlersEvent event) {
        // Bumping the version refuses every login between mismatched jars (NeoForge disconnects: incompatible network
        // version), even on an optional channel. Add payloads freely; bump only for a codec change.
        PayloadRegistrar r = event.registrar("1").optional();
        r.playToServer(Migrate.TYPE, Migrate.CODEC, (m, ctx) -> { });
        r.playToServer(Place.TYPE, Place.CODEC, (m, ctx) -> place((ServerPlayer) ctx.player(), m));
        r.playToServer(Retarget.TYPE, Retarget.CODEC, (m, ctx) -> retarget((ServerPlayer) ctx.player(), m.seat()));
        r.playToServer(Dismiss.TYPE, Dismiss.CODEC, (m, ctx) -> dismiss((ServerPlayer) ctx.player(), m.seat()));
        r.playToServer(AssignShell.TYPE, AssignShell.CODEC, (m, ctx) -> assignShell((ServerPlayer) ctx.player(), m));
        r.playToServer(RemoveShell.TYPE, RemoveShell.CODEC, (m, ctx) -> removeShell((ServerPlayer) ctx.player(), m.shell()));
        r.playToServer(Status.TYPE, Status.CODEC, (m, ctx) -> status((ServerPlayer) ctx.player(), m.bodies()));
        r.playToClient(Placed.TYPE, Placed.CODEC, (m, ctx) -> onPlaced.accept(m.bodies()));
        r.playToClient(Stats.TYPE, Stats.CODEC, (m, ctx) -> onStats.accept(m));
    }

    /** Its owner, if online with a client that knows Stats, learns {@code agent}'s XP. */
    static void sendStats(AgentEntity agent, int xp) {
        ServerPlayer owner = agent.owner().map(agent.getServer().getPlayerList()::getPlayer).orElse(null);
        if (owner != null && owner.connection.hasChannel(Stats.TYPE)) PacketDistributor.sendToPlayer(owner, new Stats(agent.getUUID(), xp));
    }

    public static void sendPlaced(ServerPlayer player) {
        if (player == null || !player.connection.hasChannel(Placed.TYPE)) return;
        PacketDistributor.sendToPlayer(player, new Placed(AgentRecords.get(player.server).bodiesOf(player.getUUID())));
    }

    private static final Map<UUID, Integer> lastAction = new HashMap<>();
    private static final Map<UUID, Integer> lastStatus = new HashMap<>();

    /** A person clicks a few times a second at most; anything faster is dropped. Main thread only. */
    private static boolean ready(ServerPlayer player) {
        if (player.isSpectator() || !player.isAlive()) return false;
        int now = player.server.getTickCount();
        Integer last = lastAction.put(player.getUUID(), now);
        return last == null || now - last >= COOLDOWN_TICKS || now < last;
    }

    static void loggedOut(ServerPlayer player) {
        lastAction.remove(player.getUUID());
        lastStatus.remove(player.getUUID());
    }

    /** A singleplayer world switch may skip the logouts. */
    static void serverStopped() {
        lastAction.clear();
        lastStatus.clear();
    }

    /** Somewhere the player could build: finite, in the world and its border, near them, outside spawn protection. */
    private static boolean canStand(ServerPlayer player, double x, double y, double z, float yaw) {
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z) || !Float.isFinite(yaw)) return false;
        if (!player.mayBuild() || player.position().distanceToSqr(x, y, z) > REACH * REACH) return false;
        BlockPos pos = BlockPos.containing(x, y, z);
        ServerLevel level = player.serverLevel();
        if (!level.isInWorldBounds(pos) || !level.getWorldBorder().isWithinBounds(pos) || !level.mayInteract(player, pos)) return false;
        return mayBuild(player, pos);
    }

    /** As if the player put something at {@code pos}: land-claim mods refuse it where the player may not build. */
    private static boolean mayBuild(ServerPlayer player, BlockPos pos) {
        ServerLevel level = player.serverLevel();
        return !NeoForge.EVENT_BUS.post(new BlockEvent.EntityPlaceEvent(BlockSnapshot.create(level.dimension(), level, pos),
                level.getBlockState(pos.below()), player)).isCanceled();
    }

    private static boolean full(AgentRecords records, ServerPlayer player, Api.Slot seat) {
        return records.find(player.getUUID(), seat) == null && records.countOf(player.getUUID()) >= AgentPayloads.MAX_AGENTS;
    }

    private static void place(ServerPlayer player, Place m) {
        if (!ready(player) || !canStand(player, m.x(), m.y(), m.z(), m.yaw())) return;
        AgentRecords records = AgentRecords.get(player.server);
        if (full(records, player, m.seat())) return;
        // A new body every time, even for a move: the items are the record's, and a body left in an unloaded
        // chunk can't be reached now anyway (it discards itself when it loads). The old one goes only once the
        // new one stands (another mod may refuse the spawn).
        AgentEntity body = AgentEntity.spawn(player.serverLevel(), new Vec3(m.x(), m.y(), m.z()), m.yaw(), player.getUUID(), m.seat());
        if (body == null) return;
        AgentRecords.Record r = records.getOrCreate(player.getUUID(), m.seat());
        discard(player.server, r.entity);
        r.entity = body.getUUID();
        sendPlaced(player);
    }

    private static void retarget(ServerPlayer player, Api.Slot seat) {
        if (!ready(player)) return;
        AgentRecords.Record r = AgentRecords.get(player.server).find(player.getUUID(), seat);
        if (r == null) return;
        r.seat = seat;
        // Unloaded: it takes the seat from its record when it next loads.
        if (loaded(player.server, r.entity) instanceof AgentEntity body) body.setSeat(seat);
        sendPlaced(player);
    }

    private static void dismiss(ServerPlayer player, Api.Slot seat) {
        if (!ready(player)) return;
        AgentRecords records = AgentRecords.get(player.server);
        AgentRecords.Record r = records.find(player.getUUID(), seat);
        if (r == null) return;
        records.remove(r);
        discard(player.server, r.entity);
        r.takeAll().forEach(player.getInventory()::placeItemBackInInventory);
        sendPlaced(player);
    }

    private static boolean nearOwnShell(ServerPlayer player, Entity e) {
        return e instanceof AgentEntity shell && shell.seat() == null && shell.isOwnedBy(player) && player.distanceToSqr(shell) <= REACH * REACH;
    }

    private static void assignShell(ServerPlayer player, AssignShell m) {
        if (!ready(player)) return;
        Entity shell = player.serverLevel().getEntity(m.shell());
        AgentRecords records = AgentRecords.get(player.server);
        if (!nearOwnShell(player, shell) || full(records, player, m.seat())) return;
        AgentRecords.Record r = records.getOrCreate(player.getUUID(), m.seat());
        if (!m.shell().equals(r.entity)) discard(player.server, r.entity);
        r.entity = m.shell();
        ((AgentEntity) shell).setSeat(m.seat());
        sendPlaced(player);
    }

    /** Every few seconds, on its own clock (not the click cooldown): which of the player's agents work, and where. */
    private static void status(ServerPlayer player, List<Work> bodies) {
        int now = player.server.getTickCount();
        Integer last = lastStatus.put(player.getUUID(), now);
        if (last != null && now - last < Tuning.STATUS_MIN_TICKS && now >= last) return;
        for (Work w : bodies) {
            if (!(player.serverLevel().getEntity(w.entity()) instanceof AgentEntity body) || !body.isOwnedBy(player)) continue;
            // Only a real Review Lectern near the body: a client can't send it across the world.
            BlockPos lectern = w.lectern().filter(p -> p.closerToCenterThan(body.position(), LECTERN_RANGE)
                    && player.serverLevel().isLoaded(p) && player.serverLevel().getBlockState(p).is(AgentOfficeMod.REVIEW_LECTERN.get())).orElse(null);
            // A desk is one the player could build at (land claims); only asked when it would be used.
            if (lectern != null && w.working() && !body.mayWorkAt(lectern, p -> mayBuild(player, p))) lectern = null;
            body.reportWork(w.working() && lectern != null, lectern);
            body.showName(w.name());
        }
    }

    private static void removeShell(ServerPlayer player, UUID id) {
        if (!ready(player)) return;
        Entity shell = player.serverLevel().getEntity(id);
        if (nearOwnShell(player, shell)) shell.discard();
    }

    private static Entity loaded(MinecraftServer server, UUID id) {
        if (id == null) return null;
        for (ServerLevel level : server.getAllLevels()) {
            Entity e = level.getEntity(id);
            if (e != null) return e;
        }
        return null;
    }

    private static void discard(MinecraftServer server, UUID id) {
        if (loaded(server, id) instanceof AgentEntity body) body.discard();
    }
}
