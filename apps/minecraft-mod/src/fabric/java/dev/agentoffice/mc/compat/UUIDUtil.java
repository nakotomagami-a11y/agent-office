package dev.agentoffice.mc.compat;

import io.netty.buffer.ByteBuf;
import java.util.UUID;

/** Minecraft 1.21's {@code UUIDUtil.STREAM_CODEC} for 1.20.1 (see {@link StreamCodec}). */
public final class UUIDUtil {
    public static final StreamCodec<ByteBuf, UUID> STREAM_CODEC = ByteBufCodecs.UUID;

    private UUIDUtil() {}
}
