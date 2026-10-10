package dev.agentoffice.mc.client;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;
import net.neoforged.neoforge.client.event.RenderLivingEvent;

/**
 * Draws a set-up agent body with the player model and its agent's skin ({@link AgentSkins}). Bodies
 * stay vanilla villagers to the game (nothing registered), so this takes over their drawing; a shell
 * keeps the villager look until it is set up.
 */
final class AgentBodyRenderer extends MobRenderer<AgentBody, PlayerModel<AgentBody>> {
    private static AgentBodyRenderer wide;
    private static AgentBodyRenderer slim;

    private AgentBodyRenderer(EntityRendererProvider.Context context, boolean slimArms) {
        // The shadow is drawn by the dispatcher with the villager renderer's radius; this 0.5f is unused.
        super(context, new PlayerModel<>(context.bakeLayer(slimArms ? ModelLayers.PLAYER_SLIM : ModelLayers.PLAYER), slimArms), 0.5f);
    }

    /** Models are rebuilt on every resource reload (F3+T too), and skin files are read again. */
    static void rebuild(EntityRenderersEvent.AddLayers event) {
        wide = new AgentBodyRenderer(event.getContext(), false);
        slim = new AgentBodyRenderer(event.getContext(), true);
        AgentSkins.clear();
        AgentSkins.ensureFolder();
    }

    static void drawInstead(RenderLivingEvent.Pre<?, ?> event) {
        if (!(event.getEntity() instanceof AgentBody body) || body.slot == null) return;
        // Our own render posts this event too.
        if (event.getRenderer() instanceof AgentBodyRenderer || wide == null) return;
        event.setCanceled(true);
        float pt = event.getPartialTick();
        (AgentSkins.of(body.slot.agentId()).slim() ? slim : wide).render(body, Mth.rotLerp(pt, body.yRotO, body.getYRot()), pt,
                event.getPoseStack(), event.getMultiBufferSource(), event.getPackedLight());
    }

    @Override
    public ResourceLocation getTextureLocation(AgentBody body) {
        return AgentSkins.of(body.slot.agentId()).texture();
    }

    @Override
    protected void scale(AgentBody body, PoseStack poseStack, float partialTick) {
        poseStack.scale(0.9375f, 0.9375f, 0.9375f); // as PlayerRenderer
    }
}
