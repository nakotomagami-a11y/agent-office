package dev.agentoffice.mc.compat;

import io.netty.buffer.ByteBuf;
import io.netty.handler.codec.DecoderException;
import io.netty.handler.codec.EncoderException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import net.minecraft.core.BlockPos;
import net.minecraft.network.FriendlyByteBuf;

/** Minecraft 1.21's {@code ByteBufCodecs} for 1.20.1, only what the mod uses (see {@link StreamCodec}). */
public final class ByteBufCodecs {
    public static final StreamCodec<ByteBuf, Boolean> BOOL = StreamCodec.of(ByteBuf::writeBoolean, ByteBuf::readBoolean);
    public static final StreamCodec<ByteBuf, Double> DOUBLE = StreamCodec.of(ByteBuf::writeDouble, ByteBuf::readDouble);
    public static final StreamCodec<ByteBuf, Float> FLOAT = StreamCodec.of(ByteBuf::writeFloat, ByteBuf::readFloat);
    public static final StreamCodec<ByteBuf, Integer> VAR_INT = StreamCodec.of(
            (buf, v) -> new FriendlyByteBuf(buf).writeVarInt(v), buf -> new FriendlyByteBuf(buf).readVarInt());
    public static final StreamCodec<ByteBuf, String> STRING_UTF8 = stringUtf8(32767);
    /** 1.21's {@code UUIDUtil.STREAM_CODEC}: two longs. */
    public static final StreamCodec<ByteBuf, UUID> UUID = StreamCodec.of(
            (buf, v) -> new FriendlyByteBuf(buf).writeUUID(v), buf -> new FriendlyByteBuf(buf).readUUID());
    /** 1.21's {@code BlockPos.STREAM_CODEC}: one packed long. */
    public static final StreamCodec<ByteBuf, BlockPos> BLOCK_POS = StreamCodec.of(
            (buf, v) -> buf.writeLong(v.asLong()), buf -> BlockPos.of(buf.readLong()));

    private ByteBufCodecs() {}

    /** A VarInt byte length, then UTF-8; longer than {@code max} characters fails both ways. */
    public static StreamCodec<ByteBuf, String> stringUtf8(int max) {
        return StreamCodec.of((buf, v) -> new FriendlyByteBuf(buf).writeUtf(v, max), buf -> new FriendlyByteBuf(buf).readUtf(max));
    }

    public static <B extends ByteBuf, V> StreamCodec<B, Optional<V>> optional(StreamCodec<? super B, V> codec) {
        return StreamCodec.of((buf, v) -> {
            buf.writeBoolean(v.isPresent());
            v.ifPresent(x -> codec.encode(buf, x));
        }, buf -> buf.readBoolean() ? Optional.of(codec.decode(buf)) : Optional.empty());
    }

    /** A VarInt count, then each element; more than {@code max} fails both ways. */
    public static <B extends ByteBuf, V> Function<StreamCodec<B, V>, StreamCodec<B, List<V>>> list(int max) {
        return codec -> StreamCodec.of((buf, list) -> {
            if (list.size() > max) throw new EncoderException(list.size() + " elements, max " + max);
            new FriendlyByteBuf(buf).writeVarInt(list.size());
            list.forEach(v -> codec.encode(buf, v));
        }, buf -> {
            int n = new FriendlyByteBuf(buf).readVarInt();
            if (n > max) throw new DecoderException(n + " elements, max " + max);
            List<V> out = new ArrayList<>(Math.min(n, 64));
            for (int i = 0; i < n; i++) out.add(codec.decode(buf));
            return out;
        });
    }
}
