package dev.agentoffice.mc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import dev.agentoffice.mc.core.Api;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.ByteBufUtil;
import io.netty.buffer.Unpooled;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import org.junit.jupiter.api.Test;

/** Every payload decodes to what was encoded, and the limits a modified client might break are enforced on decode. */
class PayloadsTest {
    private static final Api.Slot SEAT = new Api.Slot("agent-office", "Agent Office", "developer", "developer-a1", "Reviewer");
    private static final Api.Slot BARE = new Api.Slot("p", null, "cs-ceo", "cs-ceo-1", null);

    private static <T> T roundTrip(StreamCodec<ByteBuf, T> codec, T value) {
        ByteBuf buf = Unpooled.buffer();
        codec.encode(buf, value);
        T back = codec.decode(buf);
        assertEquals(0, buf.readableBytes(), "every byte read");
        return back;
    }

    @Test
    void everyPayloadSurvivesTheWire() {
        UUID id = UUID.randomUUID();
        for (Api.Slot s : List.of(SEAT, BARE)) assertEquals(s, roundTrip(AgentPayloads.SEAT, s));
        AgentPayloads.Place place = new AgentPayloads.Place(SEAT, 1.5, -60, 12.25, 90f);
        assertEquals(place, roundTrip(AgentPayloads.Place.CODEC, place));
        assertEquals(new AgentPayloads.Retarget(BARE), roundTrip(AgentPayloads.Retarget.CODEC, new AgentPayloads.Retarget(BARE)));
        assertEquals(new AgentPayloads.Dismiss(SEAT), roundTrip(AgentPayloads.Dismiss.CODEC, new AgentPayloads.Dismiss(SEAT)));
        assertEquals(new AgentPayloads.AssignShell(id, SEAT), roundTrip(AgentPayloads.AssignShell.CODEC, new AgentPayloads.AssignShell(id, SEAT)));
        assertEquals(new AgentPayloads.RemoveShell(id), roundTrip(AgentPayloads.RemoveShell.CODEC, new AgentPayloads.RemoveShell(id)));
        AgentPayloads.Status status = new AgentPayloads.Status(List.of(
                new AgentPayloads.Work(id, true, Optional.of(new BlockPos(3, 64, -7)), "Developer"),
                new AgentPayloads.Work(UUID.randomUUID(), false, Optional.empty(), "CEO")));
        assertEquals(status, roundTrip(AgentPayloads.Status.CODEC, status));
        AgentPayloads.Placed placed = new AgentPayloads.Placed(List.of(new AgentPayloads.Body(Optional.of(id), SEAT), new AgentPayloads.Body(Optional.empty(), BARE)));
        assertEquals(placed, roundTrip(AgentPayloads.Placed.CODEC, placed));
        assertEquals(new AgentPayloads.Stats(id, 4321), roundTrip(AgentPayloads.Stats.CODEC, new AgentPayloads.Stats(id, 4321)));
        AgentPayloads.Migrate migrate = new AgentPayloads.Migrate(List.of(new AgentPayloads.Migrate.Legacy(SEAT, 1, 2, 3, 4f)));
        assertEquals(migrate, roundTrip(AgentPayloads.Migrate.CODEC, migrate));
    }

    /** What a modified client might send: over-long text, too many entries. Our decoder must refuse it. */
    @Test
    void oversizedTextOrListsAreRefusedOnDecode() {
        ByteBuf text = Unpooled.buffer();
        ByteBufCodecs.stringUtf8(AgentPayloads.MAX_TEXT + 1).encode(text, "x".repeat(AgentPayloads.MAX_TEXT + 1));
        assertThrows(RuntimeException.class, () -> AgentPayloads.SEAT.decode(text));
        AgentPayloads.Work one = new AgentPayloads.Work(UUID.randomUUID(), false, Optional.empty(), "x");
        ByteBuf list = Unpooled.buffer();
        AgentPayloads.Work.CODEC.apply(ByteBufCodecs.list(AgentPayloads.MAX_AGENTS + 1)).encode(list, Collections.nCopies(AgentPayloads.MAX_AGENTS + 1, one));
        assertThrows(RuntimeException.class, () -> AgentPayloads.Status.CODEC.decode(list));
    }

    private static <T> String hex(StreamCodec<ByteBuf, T> codec, T value) {
        ByteBuf buf = Unpooled.buffer();
        codec.encode(buf, value);
        return ByteBufUtil.hexDump(buf);
    }

    /**
     * The bytes themselves: a codec change (a field added, reordered or resized) fails here. Changing one needs the
     * channel version bumped (AgentNet), which refuses every login between mismatched jars; then update these.
     */
    @Test
    void theWireFormatOnlyChangesWithTheChannelVersion() {
        UUID id = new UUID(0x0123456789abcdefL, 0x0fedcba987654321L);
        String bump = "a codec changed: bump the channel version in AgentNet.register, then update this";
        assertEquals("0c6167656e742d6f6666696365010c4167656e74204f666669636509646576656c6f7065720c646576656c6f7065722d6131010852657669657765723ff8000000000000c04e000000000000402880000000000042b40000", hex(AgentPayloads.Place.CODEC, new AgentPayloads.Place(SEAT, 1.5, -60, 12.25, 90f)), bump);
        assertEquals("010123456789abcdef0fedcba9876543210101000000ffffff904009446576656c6f706572", hex(AgentPayloads.Status.CODEC, new AgentPayloads.Status(List.of(
                new AgentPayloads.Work(id, true, Optional.of(new BlockPos(3, 64, -7)), "Developer")))), bump);
        assertEquals("01010123456789abcdef0fedcba9876543210170000663732d63656f0863732d63656f2d3100", hex(AgentPayloads.Placed.CODEC, new AgentPayloads.Placed(List.of(new AgentPayloads.Body(Optional.of(id), BARE)))), bump);
        assertEquals("010170000663732d63656f0863732d63656f2d31003ff00000000000004000000000000000400800000000000040800000", hex(AgentPayloads.Migrate.CODEC, new AgentPayloads.Migrate(List.of(new AgentPayloads.Migrate.Legacy(BARE, 1, 2, 3, 4f)))), bump);
        assertEquals("0123456789abcdef0fedcba987654321ac02", hex(AgentPayloads.Stats.CODEC, new AgentPayloads.Stats(id, 300)), bump);
    }
}
