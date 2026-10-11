package dev.agentoffice.mc;

import java.util.EnumSet;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.NeutralMob;
import net.minecraft.world.entity.OwnableEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.util.LandRandomPos;
import net.minecraft.world.entity.monster.Creeper;
import net.minecraft.world.entity.monster.Enemy;
import net.minecraft.world.entity.monster.ZombieVillager;
import net.minecraft.world.entity.monster.warden.Warden;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.AbstractArrow;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.pathfinder.Path;
import net.minecraft.world.phys.Vec3;

/**
 * How an agent moves, villager-like: it keeps near an anchor (its lectern while it works, the village bell at
 * meeting time, the village, or where it was put) and drifts around it; and it fights monsters nearby
 * whatever it is doing. The anchor is deliberately not vanilla's restriction (restrictTo), which would also
 * stop it targeting anything outside the anchor's radius: a working agent must still go and help.
 */
final class AgentGoals {
    private AgentGoals() {}

    /**
     * Somewhere to keep near: within {@code radius}, strolling about once every 2 × {@code idleTicks} on average
     * (goals are offered a start every other tick).
     */
    record Anchor(BlockPos pos, int radius, int idleTicks) {}

    /** How far past its anchor's edge it goes after a monster: it defends its place, it doesn't hunt the night. */
    static final int CHASE_BEYOND = 16;

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
    static boolean threat(AgentEntity agent, LivingEntity e) {
        if (!(e instanceof Enemy) || !e.isAlive() || spared(e)) return false;
        Anchor a = agent.anchor();
        return a == null || e.blockPosition().closerThan(a.pos(), a.radius() + CHASE_BEYOND);
    }

    /** What may hurt an agent: a mob that isn't anybody's pet or another agent (a wild wolf, bee or goat too). */
    static boolean hostile(Entity e) {
        return e instanceof Mob && !(e instanceof AgentEntity) && !(e instanceof OwnableEntity pet && pet.getOwnerUUID() != null);
    }

    /**
     * What an agent's blows and arrows may land on: whoever is fighting it, and monsters it would go after anyway.
     * Never a player, villager, golem, pet, agent, armor stand or item frame in the way.
     */
    static boolean foe(AgentEntity agent, Entity e) {
        // One being cured is spared even mid-fight: curing doesn't make it drop its target.
        if (!hostile(e) || !(e instanceof Mob m) || m instanceof ZombieVillager zv && zv.isConverting()) return false;
        return m.getTarget() == agent || agent.getLastHurtByMob() == m || m instanceof Enemy && !spared(m);
    }

    /** A skeleton's shot from the bow it holds; the arrow is its own and can't be picked up. */
    static void shoot(AgentEntity agent, LivingEntity target, float power) {
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

    static boolean holdsBow(AgentEntity agent) {
        return agent.getMainHandItem().getItem() instanceof BowItem;
    }

    /** Back inside its anchor when it strayed (after a fight, say), else an occasional stroll within it. */
    static final class Wander extends Goal {
        private final AgentEntity agent;
        private Vec3 dest;
        private double speed;
        /** After a route that can't get there (a pit, a fenced-off lectern): wait, don't search every other tick. */
        private int retryAt;

        Wander(AgentEntity agent) {
            this.agent = agent;
            setFlags(EnumSet.of(Flag.MOVE));
        }

        @Override
        public boolean canUse() {
            Anchor a = agent.anchor();
            if (a == null || agent.getTarget() != null || agent.tickCount < retryAt) return false;
            Vec3 center = Vec3.atBottomCenterOf(a.pos());
            if (agent.position().distanceToSqr(center) > (double) a.radius() * a.radius()) {
                dest = LandRandomPos.getPosTowards(agent, 8, 7, center);
                if (dest == null) dest = center;
                speed = 1.0;
                return true;
            }
            if (agent.getRandom().nextInt(a.idleTicks()) != 0) return false;
            // A stroll of up to 10 blocks towards a random spot within the anchor, like a villager's.
            Vec3 spot = center.add(agent.getRandom().nextInt(2 * a.radius() + 1) - a.radius(), 0,
                    agent.getRandom().nextInt(2 * a.radius() + 1) - a.radius());
            dest = LandRandomPos.getPosTowards(agent, Math.min(10, Math.max(4, a.radius())), 4, spot);
            speed = 0.6;
            return dest != null && dest.distanceToSqr(center) <= (double) a.radius() * a.radius();
        }

        @Override
        public void start() {
            boolean moving = agent.getNavigation().moveTo(dest.x, dest.y, dest.z, speed);
            Path path = agent.getNavigation().getPath();
            // A partial route is still walked (it gets closer); the next try waits.
            if (!moving || path == null || !path.canReach()) retryAt = agent.tickCount + 100;
        }

        @Override
        public boolean canContinueToUse() {
            return !agent.getNavigation().isDone() && agent.getTarget() == null;
        }

        @Override
        public void stop() {
            agent.getNavigation().stop();
        }
    }

    /** Hits with what it holds (a bare hand too), unless that is a bow. */
    static final class Melee extends MeleeAttackGoal {
        private final AgentEntity agent;

        Melee(AgentEntity agent) {
            super(agent, 1.0, true);
            this.agent = agent;
        }

        @Override
        public boolean canUse() {
            return !holdsBow(agent) && super.canUse();
        }

        @Override
        public boolean canContinueToUse() {
            return !holdsBow(agent) && super.canContinueToUse();
        }
    }

    /**
     * Shoots with a bow it holds, as a skeleton does: closes in to range, stops, draws, looses. Arrows are
     * its own (like a skeleton's) and can't be picked up.
     */
    static final class Bow extends Goal {
        private static final double RANGE_SQ = 15 * 15;
        private final AgentEntity agent;
        private int seen;
        private int unseen;
        private int cooldown;

        Bow(AgentEntity agent) {
            this.agent = agent;
            setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
        }

        @Override
        public boolean canUse() {
            return holdsBow(agent) && agent.getTarget() != null && agent.getTarget().isAlive();
        }

        @Override
        public void stop() {
            agent.stopUsingItem();
            agent.getNavigation().stop();
            seen = 0;
            unseen = 0;
            cooldown = 0;
        }

        @Override
        public boolean requiresUpdateEveryTick() {
            return true;
        }

        @Override
        public void tick() {
            LivingEntity target = agent.getTarget();
            if (target == null) return;
            agent.getLookControl().setLookAt(target, 30, 30);
            boolean sees = agent.getSensing().hasLineOfSight(target);
            seen = sees ? seen + 1 : 0;
            unseen = sees ? 0 : unseen + 1;
            if (agent.distanceToSqr(target) > RANGE_SQ || seen < 5) agent.getNavigation().moveTo(target, 1.0);
            else agent.getNavigation().stop();
            if (cooldown > 0) {
                cooldown--;
                return;
            }
            if (!agent.isUsingItem()) {
                if (sees) agent.startUsingItem(InteractionHand.MAIN_HAND);
            } else if (unseen > 60) {
                agent.stopUsingItem();
            } else if (sees && agent.getTicksUsingItem() >= 20) {
                int drawn = agent.getTicksUsingItem();
                agent.stopUsingItem();
                agent.performRangedAttack(target, BowItem.getPowerForTime(drawn));
                cooldown = 20;
            }
        }
    }
}
