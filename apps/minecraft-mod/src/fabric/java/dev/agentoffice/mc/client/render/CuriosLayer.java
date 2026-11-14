package dev.agentoffice.mc.client.render;

import dev.agentoffice.mc.AgentEntity;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;

/** Curios is NeoForge-only: on Fabric there is nothing to draw (AgentRenderer adds this only when Curios is loaded). */
final class CuriosLayer {
    private CuriosLayer() {}

    static void add(LivingEntityRenderer<AgentEntity, PlayerModel<AgentEntity>> renderer) {}
}
