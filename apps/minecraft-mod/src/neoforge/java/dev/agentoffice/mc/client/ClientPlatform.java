package dev.agentoffice.mc.client;

import dev.agentoffice.mc.AgentPayloads;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.network.PacketDistributor;

/** What client code asks of the loader, NeoForge's answers. Fabric's are in src/fabric, same class name. */
public final class ClientPlatform {
    private ClientPlatform() {}

    /** The world this client is in runs the mod too (always in singleplayer): it has the payload channel. */
    public static boolean serverHasMod(Minecraft mc) {
        ClientPacketListener conn = mc.getConnection();
        return conn != null && conn.hasChannel(AgentPayloads.Place.TYPE);
    }

    public static void sendToServer(CustomPacketPayload payload) {
        PacketDistributor.sendToServer(payload);
    }

    /** Lets other mods draw over a screen's background, as on any screen. */
    public static void backgroundRendered(Screen screen, GuiGraphics g) {
        NeoForge.EVENT_BUS.post(new ScreenEvent.BackgroundRendered(screen, g));
    }
}
