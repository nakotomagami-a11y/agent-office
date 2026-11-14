package dev.agentoffice.mc.mixin;

import dev.agentoffice.mc.ai.Combat;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** NeoForge's ProjectileImpactEvent, which Fabric lacks: an agent's arrow flies past what it mustn't hit (Combat). */
@Mixin(Projectile.class)
abstract class ProjectileMixin {
    @Inject(method = "onHit", at = @At("HEAD"), cancellable = true)
    private void agentoffice$impact(HitResult result, CallbackInfo ci) {
        if (result instanceof EntityHitResult hit && Combat.blocksImpact((Projectile) (Object) this, hit.getEntity())) ci.cancel();
    }
}
