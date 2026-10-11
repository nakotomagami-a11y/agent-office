package dev.agentoffice.mc.ai;

import dev.agentoffice.mc.AgentEntity;
import dev.agentoffice.mc.core.Ids;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.NeutralMob;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.animal.AbstractGolem;
import net.minecraft.world.entity.monster.Creeper;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.monster.ZombieVillager;
import net.minecraft.world.entity.monster.warden.Warden;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.AbstractArrow;
import net.minecraft.world.entity.projectile.FishingHook;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.phys.EntityHitResult;
import net.neoforged.bus.api.EventPriority;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.event.EventHooks;
import net.neoforged.neoforge.event.entity.ProjectileImpactEvent;
import net.neoforged.neoforge.event.entity.living.LivingDeathEvent;
import net.neoforged.neoforge.event.entity.living.LivingIncomingDamageEvent;
import net.neoforged.neoforge.event.entity.living.LivingUseTotemEvent;

/**
 * Who an agent fights and how: monsters near its place, whatever it is doing; never a player, villager, golem, pet,
 * another agent or something in the way. Only mobs that fight it can hurt it (AgentEntity#isInvulnerableTo).
 */
public final class Combat {
    /** How far past its anchor's edge it goes after a monster: it defends its place, it doesn't hunt the night. */
    public static final int CHASE_BEYOND = 16;
    /** On a dead mob: its kill XP went to an agent already. */
    private static final String PAID = Ids.MOD_ID + ":xp_paid";

    private Combat() {}

    /** The world's side: what an agent's blows and arrows may land on, and what it shrugs off. */
    public static void register(IEventBus bus) {
        // Nobody reels an agent in; and an agent's arrow flies past what it mustn't hit (armor stands and item frames
        // are no living entities: the damage check below never sees them).
        bus.addListener((ProjectileImpactEvent e) -> {
            if (!(e.getRayTraceResult() instanceof EntityHitResult hit)) return;
            if (e.getProjectile() instanceof FishingHook && hit.getEntity() instanceof AgentEntity) e.setCanceled(true);
            if (e.getProjectile().getOwner() instanceof AgentEntity agent && !foe(agent, hit.getEntity())) e.setCanceled(true);
        });
        // An agent's blows and arrows land on its foes only: never a player, villager, golem, pet or agent in the way.
        bus.addListener((LivingIncomingDamageEvent e) -> {
            if (e.getSource().getEntity() instanceof AgentEntity agent && !foe(agent, e.getEntity())) e.setCanceled(true);
        });
        // A kill earns the agent what it would have earned a player, by the same rules (no doMobLoot, nothing already
        // paid out), once per death: last, so a mod that cancels the death (a revive) has had its say. Nothing for a baby:
        // a baby zombie's reward grows each time it is asked, and vanilla asks again when a player hit it too.
        bus.addListener(EventPriority.LOWEST, (LivingDeathEvent e) -> {
            LivingEntity dead = e.getEntity();
            if (!(e.getSource().getEntity() instanceof AgentEntity agent) || !(dead.level() instanceof ServerLevel level)) return;
            if (dead.isBaby() || dead.wasExperienceConsumed() || !dead.shouldDropExperience() || !level.getGameRules().getBoolean(GameRules.RULE_DOMOBLOOT)) return;
            if (dead.getPersistentData().getBoolean(PAID)) return;
            dead.getPersistentData().putBoolean(PAID, true);
            agent.gainXp(EventHooks.getExperienceDrop(dead, null, dead.getExperienceReward(level, agent)));
        });
        // Only armor and weapons count for an agent: a totem in its hand is just something it holds.
        bus.addListener((LivingUseTotemEvent e) -> {
            if (e.getEntity() instanceof AgentEntity) e.setCanceled(true);
        });
    }

    /**
     * Left alone even though it's a monster: a creeper (in its face it blows up), a warden, a calm neutral one
     * (endermen, zombified piglins: hitting one starts a fight it needn't have), one being cured, one carried in a
     * boat or minecart or ridden by a player, or a named one (someone's prize).
     */
    private static boolean spared(LivingEntity e) {
        // Riding: in a boat or minecart (someone moving it), not a jockey; ridden: by a player.
        return e instanceof Creeper || e instanceof Warden || e.hasCustomName()
                || e.getVehicle() != null && !(e.getVehicle() instanceof Mob) || e.hasPassenger(p -> p instanceof Player)
                || e instanceof ZombieVillager zv && zv.isConverting() || e instanceof NeutralMob neutral && !neutral.isAngry();
    }

    /** What an agent goes after: a monster near its place that isn't spared. */
    public static boolean threat(AgentEntity agent, LivingEntity e) {
        if (!(e instanceof Enemy) || !e.isAlive() || spared(e)) return false;
        Anchor a = agent.anchor();
        return a == null || e.blockPosition().closerThan(a.pos(), a.radius() + CHASE_BEYOND);
    }

    /**
     * What may hurt an agent: a mob that isn't anybody's pet, a golem or another agent (a wild wolf, bee or goat too). A
     * snow golem's snowball must not make the agent turn on it.
     */
    public static boolean hostile(Entity e) {
        return e instanceof Mob && !(e instanceof AgentEntity) && !(e instanceof OwnableEntity pet && pet.getOwnerUUID() != null)
                && !(e instanceof AbstractGolem && !(e instanceof Enemy));
    }

    /**
     * What an agent's blows and arrows may land on: whoever is fighting it, and monsters it would go after anyway.
     * Never a player, villager, golem, pet, agent, armor stand or item frame in the way.
     */
    public static boolean foe(AgentEntity agent, Entity e) {
        // One being cured is spared even mid-fight: curing doesn't make it drop its target.
        if (!hostile(e) || !(e instanceof Mob m) || m instanceof ZombieVillager zv && zv.isConverting()) return false;
        return m.getTarget() == agent || agent.getLastHurtByMob() == m || m instanceof Enemy && !spared(m);
    }

    /** A skeleton's shot from the bow it holds; the arrow is its own and can't be picked up. */
    public static void shoot(AgentEntity agent, LivingEntity target, float power) {
        ItemStack bow = agent.getMainHandItem();
        if (!(bow.getItem() instanceof BowItem weapon)) return;
        AbstractArrow arrow = weapon.customArrow(ProjectileUtil.getMobArrow(agent, new ItemStack(Items.ARROW), power, bow), new ItemStack(Items.ARROW), bow);
        arrow.pickup = AbstractArrow.Pickup.DISALLOWED;
        double dx = target.getX() - agent.getX();
        double dy = target.getY(1 / 3.0) - arrow.getY();
        double dz = target.getZ() - agent.getZ();
        arrow.shoot(dx, dy + Math.sqrt(dx * dx + dz * dz) * 0.2, dz, 1.6f, 14 - agent.level().getDifficulty().getId() * 4);
        agent.playSound(SoundEvents.ARROW_SHOOT, 1, 1 / (agent.getRandom().nextFloat() * 0.4f + 0.8f));
        agent.level().addFreshEntity(arrow);
    }

    public static boolean holdsBow(AgentEntity agent) {
        return agent.getMainHandItem().getItem() instanceof BowItem;
    }
}
