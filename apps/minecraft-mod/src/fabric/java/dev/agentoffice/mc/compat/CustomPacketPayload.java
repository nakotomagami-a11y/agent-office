package dev.agentoffice.mc.compat;

import net.minecraft.resources.ResourceLocation;

/** Minecraft 1.21's payload interface for 1.20.1, where a packet is a channel id plus bytes (see {@link StreamCodec}). */
public interface CustomPacketPayload {
    Type<? extends CustomPacketPayload> type();

    record Type<T extends CustomPacketPayload>(ResourceLocation id) {}
}
