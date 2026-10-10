package dev.agentoffice.mc.client;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.agentoffice.mc.AgentEntity;
import dev.agentoffice.mc.CuriosCompat;
import net.minecraft.client.model.HumanoidArmorModel;
import net.minecraft.client.model.HumanoidModel;
import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.VillagerModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.MobRenderer;
import net.minecraft.client.renderer.entity.layers.CustomHeadLayer;
import net.minecraft.client.renderer.entity.layers.ElytraLayer;
import net.minecraft.client.renderer.entity.layers.HumanoidArmorLayer;
import net.minecraft.client.renderer.entity.layers.ItemInHandLayer;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.resources.ResourceLocation;

/**
 * Draws an agent's body: once set up, the player model in its agent's skin ({@link AgentSkins}) wearing and
 * holding what it has, like a player; a shell, a villager in the nitwit's green robe.
 */
final class AgentRenderer extends EntityRenderer<AgentEntity> {
    private final Person wide;
    private final Person slim;
    private final Shell shell;

    AgentRenderer(EntityRendererProvider.Context context) {
        super(context);
        shadowRadius = 0.5f;
        wide = new Person(context, false);
        slim = new Person(context, true);
        shell = new Shell(context);
        // Renderers are rebuilt on every resource reload (F3+T too): skin files are read again.
        AgentSkins.clear();
        AgentSkins.ensureFolder();
    }

    private LivingEntityRenderer<AgentEntity, ?> look(AgentEntity body) {
        if (body.isShell()) return shell;
        return AgentSkins.of(body.agentId()).slim() ? slim : wide;
    }

    @Override
    public void render(AgentEntity body, float yaw, float partialTick, PoseStack pose, MultiBufferSource buffers, int light) {
        look(body).render(body, yaw, partialTick, pose, buffers, light);
    }

    @Override
    public ResourceLocation getTextureLocation(AgentEntity body) {
        return look(body).getTextureLocation(body);
    }

    private static final class Person extends MobRenderer<AgentEntity, PlayerModel<AgentEntity>> {
        Person(EntityRendererProvider.Context context, boolean slimArms) {
            super(context, new PlayerModel<>(context.bakeLayer(slimArms ? ModelLayers.PLAYER_SLIM : ModelLayers.PLAYER), slimArms), 0.5f);
            addLayer(new HumanoidArmorLayer<>(this,
                    new HumanoidArmorModel<>(context.bakeLayer(slimArms ? ModelLayers.PLAYER_SLIM_INNER_ARMOR : ModelLayers.PLAYER_INNER_ARMOR)),
                    new HumanoidArmorModel<>(context.bakeLayer(slimArms ? ModelLayers.PLAYER_SLIM_OUTER_ARMOR : ModelLayers.PLAYER_OUTER_ARMOR)),
                    context.getModelManager()));
            addLayer(new ItemInHandLayer<>(this, context.getItemInHandRenderer()));
            addLayer(new ElytraLayer<>(this, context.getModelSet()));
            addLayer(new CustomHeadLayer<>(this, context.getModelSet(), context.getItemInHandRenderer()));
            if (CuriosCompat.LOADED) CuriosLayer.add(this);
        }

        @Override
        public void render(AgentEntity body, float yaw, float partialTick, PoseStack pose, MultiBufferSource buffers, int light) {
            // As PlayerRenderer: an arm holding something is raised a little.
            model.rightArmPose = body.getMainHandItem().isEmpty() ? HumanoidModel.ArmPose.EMPTY : HumanoidModel.ArmPose.ITEM;
            model.leftArmPose = body.getOffhandItem().isEmpty() ? HumanoidModel.ArmPose.EMPTY : HumanoidModel.ArmPose.ITEM;
            super.render(body, yaw, partialTick, pose, buffers, light);
        }

        @Override
        public ResourceLocation getTextureLocation(AgentEntity body) {
            return AgentSkins.of(body.agentId()).texture();
        }

        @Override
        protected void scale(AgentEntity body, PoseStack pose, float partialTick) {
            pose.scale(0.9375f, 0.9375f, 0.9375f); // as PlayerRenderer
        }
    }

    private static final class Shell extends MobRenderer<AgentEntity, VillagerModel<AgentEntity>> {
        private static final ResourceLocation BASE = ResourceLocation.withDefaultNamespace("textures/entity/villager/villager.png");
        private static final ResourceLocation PLAINS = ResourceLocation.withDefaultNamespace("textures/entity/villager/type/plains.png");
        private static final ResourceLocation NITWIT = ResourceLocation.withDefaultNamespace("textures/entity/villager/profession/nitwit.png");

        Shell(EntityRendererProvider.Context context) {
            super(context, new VillagerModel<>(context.bakeLayer(ModelLayers.VILLAGER)), 0.5f);
            addLayer(new RenderLayer<>(this) {
                @Override
                public void render(PoseStack pose, MultiBufferSource buffers, int light, AgentEntity body,
                                   float limbSwing, float limbSwingAmount, float partialTick, float ageInTicks, float netHeadYaw, float headPitch) {
                    if (body.isInvisible()) return;
                    renderColoredCutoutModel(getParentModel(), PLAINS, pose, buffers, light, body, -1);
                    renderColoredCutoutModel(getParentModel(), NITWIT, pose, buffers, light, body, -1);
                }
            });
        }

        @Override
        public ResourceLocation getTextureLocation(AgentEntity body) {
            return BASE;
        }

        @Override
        protected void scale(AgentEntity body, PoseStack pose, float partialTick) {
            pose.scale(0.9375f, 0.9375f, 0.9375f); // as VillagerRenderer
        }
    }
}
