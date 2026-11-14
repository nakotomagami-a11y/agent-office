package dev.agentoffice.mc.client;

import net.fabricmc.api.ClientModInitializer;

/** The client half of the mod: screens, rendering, the K key and the connection to Agent Office. */
public final class AgentOfficeClientMod implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        ClientSetup.init();
    }
}
