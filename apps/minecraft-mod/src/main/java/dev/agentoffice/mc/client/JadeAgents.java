package dev.agentoffice.mc.client;

import dev.agentoffice.mc.AgentEntity;
import dev.agentoffice.mc.client.render.AgentRenderer;
import dev.agentoffice.mc.client.service.AgentStatus;
import dev.agentoffice.mc.client.service.Bodies;
import dev.agentoffice.mc.core.AgentState;
import dev.agentoffice.mc.core.Api;
import dev.agentoffice.mc.core.Ids;
import dev.agentoffice.mc.core.Levels;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import snownee.jade.api.EntityAccessor;
import snownee.jade.api.IEntityComponentProvider;
import snownee.jade.api.ITooltip;
import snownee.jade.api.IWailaClientRegistration;
import snownee.jade.api.IWailaPlugin;
import snownee.jade.api.WailaPlugin;
import snownee.jade.api.config.IPluginConfig;

/**
 * Jade (optional; it finds this class itself and nothing else names it): looking at your own agent shows how it is
 * doing, its level and its project. Everyone else's agents show Jade's usual lines, as on the nameplate. All of it is
 * what the owner's client already knows.
 * <p>Jade loads this class on dedicated servers too (and calls only the no-op {@code register} there): this outer
 * class must name no client type in a field, signature or initializer; everything client-side stays in {@link Tooltip}.
 */
@WailaPlugin
public final class JadeAgents implements IWailaPlugin {
    @Override
    public void registerClient(IWailaClientRegistration registration) {
        registration.registerEntityComponent(Tooltip.INSTANCE, AgentEntity.class);
    }

    private enum Tooltip implements IEntityComponentProvider {
        INSTANCE;

        private static final ResourceLocation UID = ResourceLocation.fromNamespaceAndPath(Ids.MOD_ID, "agent");

        @Override
        public void appendTooltip(ITooltip tooltip, EntityAccessor accessor, IPluginConfig config) {
            if (!(accessor.getEntity() instanceof AgentEntity body)) return;
            Api.Slot seat = Bodies.seatOf(body);
            if (seat == null) return;
            AgentState state = AgentStatus.of(seat);
            if (state != null) tooltip.add(AgentRenderer.stateText(state));
            Integer xp = Bodies.xpOf(body);
            if (xp != null) tooltip.add(Component.literal(Levels.describe(xp)));
            if (seat.projectName() != null) tooltip.add(Component.literal("Works on " + seat.projectName()).withStyle(ChatFormatting.GRAY));
        }

        @Override
        public ResourceLocation getUid() {
            return UID;
        }
    }
}
