package dev.agentoffice.mc;

import dev.agentoffice.mc.core.Api;
import io.netty.buffer.ByteBuf;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.UUIDUtil;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.Vec3;
import net.neoforged.neoforge.network.PacketDistributor;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;

/**
 * What the tablet asks of the world (place, switch seat, dismiss, set up or remove a shell, bring old
 * client-only bodies over), and the list of a player's placed agents that the world sends back. Optional
 * channels: the client still joins a server without the mod, where it just can't place agents.
 *
 * Any client can send these, a modified one included: every handler checks ownership, reach and limits.
 */
public final class AgentNet {
    /** Set by the client setup; this class must not reference client classes itself. */
    public static Consumer<List<Body>> onPlaced = bodies -> { };

    /** Per player, so a modified client can't fill a world with agents. */
    public static final int MAX_AGENTS = 64;
    public static final int MAX_TEXT = 128;
    private static final double REACH = 32;
    /** Old bodies are brought over only near the player, where the chunks load anyway. */
    public static final double MIGRATE_RANGE = 128;
    private static final int COOLDOWN_TICKS = 4;

    private static final StreamCodec<ByteBuf, String> TEXT = ByteBufCodecs.stringUtf8(MAX_TEXT);
    private static final StreamCodec<ByteBuf, String> NULLABLE_TEXT = ByteBufCodecs.optional(TEXT).map(o -> o.orElse(null), Optional::ofNullable);
    static final StreamCodec<ByteBuf, Api.Slot> SEAT = StreamCodec.composite(
            TEXT, Api.Slot::projectId,
            NULLABLE_TEXT, Api.Slot::projectName,
            TEXT, Api.Slot::agentId,
            TEXT, Api.Slot::instanceId,
            NULLABLE_TEXT, Api.Slot::label,
            Api.Slot::new);

    private static <T extends CustomPacketPayload> CustomPacketPayload.Type<T> typeOf(String path) {
        return new CustomPacketPayload.Type<>(ResourceLocation.fromNamespaceAndPath(AgentOfficeMod.MOD_ID, path));
    }

    /** Put the agent's body at {@code x y z} (moving it if it stands elsewhere), talking to {@code seat}. */
    public record Place(Api.Slot seat, double x, double y, double z, float yaw) implements CustomPacketPayload {
        public static final Type<Place> TYPE = typeOf("place");
        static final StreamCodec<ByteBuf, Place> CODEC = StreamCodec.composite(SEAT, Place::seat, ByteBufCodecs.DOUBLE, Place::x,
                ByteBufCodecs.DOUBLE, Place::y, ByteBufCodecs.DOUBLE, Place::z, ByteBufCodecs.FLOAT, Place::yaw, Place::new);

        @Override
        public Type<Place> type() {
            return TYPE;
        }
    }

    public record Retarget(Api.Slot seat) implements CustomPacketPayload {
        static final Type<Retarget> TYPE = typeOf("retarget");
        static final StreamCodec<ByteBuf, Retarget> CODEC = SEAT.map(Retarget::new, Retarget::seat);

        @Override
        public Type<Retarget> type() {
            return TYPE;
        }
    }

    /** Its body goes; its items go back to the player. */
    public record Dismiss(Api.Slot seat) implements CustomPacketPayload {
        static final Type<Dismiss> TYPE = typeOf("dismiss");
        static final StreamCodec<ByteBuf, Dismiss> CODEC = SEAT.map(Dismiss::new, Dismiss::seat);

        @Override
        public Type<Dismiss> type() {
            return TYPE;
        }
    }

    public record AssignShell(UUID shell, Api.Slot seat) implements CustomPacketPayload {
        static final Type<AssignShell> TYPE = typeOf("assign_shell");
        static final StreamCodec<ByteBuf, AssignShell> CODEC = StreamCodec.composite(
                UUIDUtil.STREAM_CODEC, AssignShell::shell, SEAT, AssignShell::seat, AssignShell::new);

        @Override
        public Type<AssignShell> type() {
            return TYPE;
        }
    }

    public record RemoveShell(UUID shell) implements CustomPacketPayload {
        static final Type<RemoveShell> TYPE = typeOf("remove_shell");
        static final StreamCodec<ByteBuf, RemoveShell> CODEC = UUIDUtil.STREAM_CODEC.map(RemoveShell::new, RemoveShell::shell);

        @Override
        public Type<RemoveShell> type() {
            return TYPE;
        }
    }

    /** A body from before bodies were entities (agentoffice-bodies.json), near the player in their dimension. */
    public record Legacy(Api.Slot seat, double x, double y, double z, float yaw) {
        static final StreamCodec<ByteBuf, Legacy> CODEC = StreamCodec.composite(SEAT, Legacy::seat, ByteBufCodecs.DOUBLE, Legacy::x,
                ByteBufCodecs.DOUBLE, Legacy::y, ByteBufCodecs.DOUBLE, Legacy::z, ByteBufCodecs.FLOAT, Legacy::yaw, Legacy::new);
    }

    public record Migrate(List<Legacy> bodies) implements CustomPacketPayload {
        static final Type<Migrate> TYPE = typeOf("migrate");
        static final StreamCodec<ByteBuf, Migrate> CODEC = Legacy.CODEC.apply(ByteBufCodecs.list(MAX_AGENTS)).map(Migrate::new, Migrate::bodies);

        @Override
        public Type<Migrate> type() {
            return TYPE;
        }
    }

    /**
     * One of the player's placed agents: the seat it talks to and the entity that is its body (none after it
     * died; Place brings it back with its items). Only its owner is told the seat: other clients see a name.
     */
    public record Body(Optional<UUID> entity, Api.Slot seat) {
        static final StreamCodec<ByteBuf, Body> CODEC = StreamCodec.composite(
                ByteBufCodecs.optional(UUIDUtil.STREAM_CODEC), Body::entity, SEAT, Body::seat, Body::new);
    }

    public record Placed(List<Body> bodies) implements CustomPacketPayload {
        static final Type<Placed> TYPE = typeOf("placed");
        static final StreamCodec<ByteBuf, Placed> CODEC = Body.CODEC.apply(ByteBufCodecs.list(MAX_AGENTS)).map(Placed::new, Placed::bodies);

        @Override
        public Type<Placed> type() {
            return TYPE;
        }
    }

    private AgentNet() {}

    static void register(RegisterPayloadHandlersEvent event) {
        PayloadRegistrar r = event.registrar("1").optional();
        r.playToServer(Place.TYPE, Place.CODEC, (m, ctx) -> place((ServerPlayer) ctx.player(), m));
        r.playToServer(Retarget.TYPE, Retarget.CODEC, (m, ctx) -> retarget((ServerPlayer) ctx.player(), m.seat()));
        r.playToServer(Dismiss.TYPE, Dismiss.CODEC, (m, ctx) -> dismiss((ServerPlayer) ctx.player(), m.seat()));
        r.playToServer(AssignShell.TYPE, AssignShell.CODEC, (m, ctx) -> assignShell((ServerPlayer) ctx.player(), m));
        r.playToServer(RemoveShell.TYPE, RemoveShell.CODEC, (m, ctx) -> removeShell((ServerPlayer) ctx.player(), m.shell()));
        r.playToServer(Migrate.TYPE, Migrate.CODEC, (m, ctx) -> migrate((ServerPlayer) ctx.player(), m.bodies()));
        r.playToClient(Placed.TYPE, Placed.CODEC, (m, ctx) -> onPlaced.accept(m.bodies()));
    }

    public static void sendPlaced(ServerPlayer player) {
        if (player == null || !player.connection.hasChannel(Placed.TYPE)) return;
        PacketDistributor.sendToPlayer(player, new Placed(AgentRecords.get(player.server).bodiesOf(player.getUUID())));
    }

    private static final Map<UUID, Integer> lastAction = new HashMap<>();
    private static final Set<UUID> migrated = new HashSet<>();

    /** A person clicks a few times a second at most; anything faster is dropped. Main thread only. */
    private static boolean ready(ServerPlayer player) {
        if (player.isSpectator() || !player.isAlive()) return false;
        int now = player.server.getTickCount();
        Integer last = lastAction.put(player.getUUID(), now);
        return last == null || now - last >= COOLDOWN_TICKS || now < last;
    }

    static void loggedOut(ServerPlayer player) {
        lastAction.remove(player.getUUID());
        migrated.remove(player.getUUID());
    }

    /** A singleplayer world switch may skip the logouts. */
    static void serverStopped() {
        lastAction.clear();
        migrated.clear();
    }

    /** Somewhere the player could build: finite, in the world and its border, near them, outside spawn protection. */
    private static boolean canStand(ServerPlayer player, double x, double y, double z, float yaw, double range) {
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z) || !Float.isFinite(yaw)) return false;
        if (!player.mayBuild() || player.position().distanceToSqr(x, y, z) > range * range) return false;
        BlockPos pos = BlockPos.containing(x, y, z);
        ServerLevel level = player.serverLevel();
        return level.isInWorldBounds(pos) && level.getWorldBorder().isWithinBounds(pos) && level.mayInteract(player, pos);
    }

    private static boolean full(AgentRecords records, ServerPlayer player, Api.Slot seat) {
        return records.find(player.getUUID(), seat) == null && records.countOf(player.getUUID()) >= MAX_AGENTS;
    }

    private static void place(ServerPlayer player, Place m) {
        if (!ready(player) || !canStand(player, m.x(), m.y(), m.z(), m.yaw(), REACH)) return;
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

    private static void removeShell(ServerPlayer player, UUID id) {
        if (!ready(player)) return;
        Entity shell = player.serverLevel().getEntity(id);
        if (nearOwnShell(player, shell)) shell.discard();
    }

    /** Old bodies near the player stand where they stood; an agent it already has here is skipped. */
    private static void migrate(ServerPlayer player, List<Legacy> bodies) {
        // Once a login (the client sends it once a join), so outside the click cooldown.
        if (player.isSpectator() || !player.isAlive() || !migrated.add(player.getUUID())) return;
        AgentRecords records = AgentRecords.get(player.server);
        for (Legacy b : bodies) {
            if (!canStand(player, b.x(), b.y(), b.z(), b.yaw(), MIGRATE_RANGE)) continue;
            if (records.find(player.getUUID(), b.seat()) != null || full(records, player, b.seat())) continue;
            if (!player.serverLevel().hasChunkAt(BlockPos.containing(b.x(), b.y(), b.z()))) continue; // never loads or generates one
            AgentEntity body = AgentEntity.spawn(player.serverLevel(), new Vec3(b.x(), b.y(), b.z()), b.yaw(), player.getUUID(), b.seat());
            if (body != null) records.getOrCreate(player.getUUID(), b.seat()).entity = body.getUUID();
        }
        sendPlaced(player);
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
