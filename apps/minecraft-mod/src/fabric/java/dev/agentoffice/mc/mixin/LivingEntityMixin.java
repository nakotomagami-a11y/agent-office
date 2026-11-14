package dev.agentoffice.mc.mixin;

import dev.agentoffice.mc.AgentEntity;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** NeoForge's LivingUseTotemEvent, which Fabric lacks: a totem in an agent's hand is just something it holds. */
@Mixin(LivingEntity.class)
abstract class LivingEntityMixin {
    @Inject(method = "checkTotemDeathProtection", at = @At("HEAD"), cancellable = true)
    private void agentoffice$noTotem(DamageSource source, CallbackInfoReturnable<Boolean> cir) {
        if ((Object) this instanceof AgentEntity) cir.setReturnValue(false);
    }
}
