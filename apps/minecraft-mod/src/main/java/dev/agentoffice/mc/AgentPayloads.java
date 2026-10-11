package dev.agentoffice.mc;

import dev.agentoffice.mc.core.Api;
import io.netty.buffer.ByteBuf;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.core.UUIDUtil;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

/**
 * What goes over the wire between the tablet and the world, and the limits every decode enforces (a modified client
 * can send anything). Handlers are {@link AgentNet}'s. Rule: add payloads freely; never change a codec without bumping
 * AgentNet's channel version, which refuses every login between mismatched jars.
 */
public final class AgentPayloads {
    /** Per player, so a modified client can't fill a world with agents. */
    public static final int MAX_AGENTS = 64;
    public static final int MAX_TEXT = 128;

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

    /**
     * What a client before 0.8.0 sends once a join to bring pre-0.6.0 bodies over. Still decoded and then ignored: a
     * payload missing on one side is fine on an optional channel, but a changed channel version refuses the login, and
     * an old client sending a payload this side never registered fails on its own tick.
     */
    public record Migrate(List<Legacy> bodies) implements CustomPacketPayload {
        static final Type<Migrate> TYPE = typeOf("migrate");
        static final StreamCodec<ByteBuf, Migrate> CODEC = Legacy.CODEC.apply(ByteBufCodecs.list(MAX_AGENTS)).map(Migrate::new, Migrate::bodies);

        @Override
        public Type<Migrate> type() {
            return TYPE;
        }

        public record Legacy(Api.Slot seat, double x, double y, double z, float yaw) {
            static final StreamCodec<ByteBuf, Legacy> CODEC = StreamCodec.composite(SEAT, Legacy::seat, ByteBufCodecs.DOUBLE, Legacy::x,
                    ByteBufCodecs.DOUBLE, Legacy::y, ByteBufCodecs.DOUBLE, Legacy::z, ByteBufCodecs.FLOAT, Legacy::yaw, Legacy::new);
        }
    }

    /**
     * One body's agent is working in Agent Office (running, or waiting on its owner), at this lectern if any; and its
     * name as Agent Office has it (only the owner's client knows), for everyone's nameplate.
     */
    public record Work(UUID entity, boolean working, Optional<BlockPos> lectern, String name) {
        static final StreamCodec<ByteBuf, Work> CODEC = StreamCodec.composite(UUIDUtil.STREAM_CODEC, Work::entity, ByteBufCodecs.BOOL,
                Work::working, ByteBufCodecs.optional(BlockPos.STREAM_CODEC), Work::lectern, TEXT, Work::name, Work::new);
    }

    /** From the owner's client every few seconds: only it can ask Agent Office whether its agents are working. */
    public record Status(List<Work> bodies) implements CustomPacketPayload {
        static final Type<Status> TYPE = typeOf("status");
        static final StreamCodec<ByteBuf, Status> CODEC = Work.CODEC.apply(ByteBufCodecs.list(MAX_AGENTS)).map(Status::new, Status::bodies);

        @Override
        public Type<Status> type() {
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

    /**
     * To its owner only: how much XP one of their agents has (its level, core/Levels). A payload, not entity data:
     * another entity data field would break older clients, and other players have no need of it.
     */
    public record Stats(UUID entity, int xp) implements CustomPacketPayload {
        static final Type<Stats> TYPE = typeOf("stats");
        static final StreamCodec<ByteBuf, Stats> CODEC = StreamCodec.composite(
                UUIDUtil.STREAM_CODEC, Stats::entity, ByteBufCodecs.VAR_INT, Stats::xp, Stats::new);

        @Override
        public Type<Stats> type() {
            return TYPE;
        }
    }

    private AgentPayloads() {}
}
