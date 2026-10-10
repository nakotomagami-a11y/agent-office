package dev.agentoffice.mc.client;

import dev.agentoffice.mc.AgentOfficeMod;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;

/** The client half of the mod: screens, rendering, the K key and the connection to Agent Office. */
@Mod(value = AgentOfficeMod.MOD_ID, dist = Dist.CLIENT)
public final class AgentOfficeClientMod {
    public AgentOfficeClientMod(IEventBus modBus, ModContainer container) {
        ClientSetup.init(modBus, container);
    }
}
