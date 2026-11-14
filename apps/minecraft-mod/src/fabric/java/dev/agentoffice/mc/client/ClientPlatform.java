package dev.agentoffice.mc.client;

import dev.agentoffice.mc.AgentPayloads;
import dev.agentoffice.mc.Platform;
import dev.agentoffice.mc.compat.CustomPacketPayload;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.resources.ResourceLocation;

/** What client code asks of the loader, Fabric's answers. NeoForge's are in src/neoforge, same class name. */
public final class ClientPlatform {
    private ClientPlatform() {}

    /** The world this client is in runs the mod too (always in singleplayer): it listens on the payload channel. */
    public static boolean serverHasMod(Minecraft mc) {
        return mc.getConnection() != null && ClientPlayNetworking.canSend(Platform.channel(AgentPayloads.Place.TYPE));
    }

    public static void sendToServer(CustomPacketPayload payload) {
        ResourceLocation channel = Platform.channel(payload.type());
        if (ClientPlayNetworking.canSend(channel)) ClientPlayNetworking.send(channel, Platform.encode(payload));
    }

    /** NeoForge lets other mods draw over a screen's background here; Fabric has no such event. */
    public static void backgroundRendered(Screen screen, GuiGraphics g) {}
}
