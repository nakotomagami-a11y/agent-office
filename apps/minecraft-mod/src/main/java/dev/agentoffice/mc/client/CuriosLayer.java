package dev.agentoffice.mc.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.agentoffice.mc.AgentEntity;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import top.theillusivec4.curios.api.SlotContext;
import top.theillusivec4.curios.api.client.CuriosRendererRegistry;

/**
 * What an agent's Curios slots hold, drawn by each item's own Curios renderer as on a player. The agent has
 * no Curios inventory, so no Curios effect ever applies to it: the items come from its synced data.
 * Only loaded with Curios installed.
 */
final class CuriosLayer extends RenderLayer<AgentEntity, PlayerModel<AgentEntity>> {
    private static final Logger LOG = LoggerFactory.getLogger("agentoffice");
    private static final Set<Item> broken = new HashSet<>();

    private final LivingEntityRenderer<AgentEntity, PlayerModel<AgentEntity>> parent;

    private CuriosLayer(LivingEntityRenderer<AgentEntity, PlayerModel<AgentEntity>> parent) {
        super(parent);
        this.parent = parent;
    }

    static void add(LivingEntityRenderer<AgentEntity, PlayerModel<AgentEntity>> renderer) {
        renderer.addLayer(new CuriosLayer(renderer));
    }

    @Override
    public void render(PoseStack pose, MultiBufferSource buffers, int light, AgentEntity body,
                       float limbSwing, float limbSwingAmount, float partialTick, float ageInTicks, float netHeadYaw, float headPitch) {
        body.curiosShown().forEach((id, stacks) -> draw(id, stacks, pose, buffers, light, body,
                limbSwing, limbSwingAmount, partialTick, ageInTicks, netHeadYaw, headPitch));
    }

    private void draw(String id, List<ItemStack> stacks, PoseStack pose, MultiBufferSource buffers, int light, AgentEntity body,
                      float limbSwing, float limbSwingAmount, float partialTick, float ageInTicks, float netHeadYaw, float headPitch) {
        for (int i = 0; i < stacks.size(); i++) {
            ItemStack stack = stacks.get(i);
            if (stack.isEmpty()) continue;
            if (broken.contains(stack.getItem())) continue;
            SlotContext slot = new SlotContext(id, body, i, false, true);
            CuriosRendererRegistry.getRenderer(stack.getItem()).ifPresent(r -> {
                pose.pushPose();
                try {
                    r.render(stack, slot, pose, parent, buffers, light, limbSwing, limbSwingAmount, partialTick, ageInTicks, netHeadYaw, headPitch);
                } catch (RuntimeException | LinkageError e) {
                    // Written for players: some expect a Curios inventory (or a Player) the agent doesn't have.
                    // Skipped from now on, rather than crashing every frame.
                    broken.add(stack.getItem());
                    LOG.warn("not drawing {} on agents: its Curios renderer failed", stack.getItem(), e);
                } finally {
                    pose.popPose();
                }
            });
        }
    }
}
