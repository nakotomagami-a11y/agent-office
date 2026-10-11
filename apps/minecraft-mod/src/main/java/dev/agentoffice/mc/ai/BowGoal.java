package dev.agentoffice.mc.ai;

import dev.agentoffice.mc.AgentEntity;
import java.util.EnumSet;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.item.BowItem;

/**
 * Shoots with a bow it holds, as a skeleton does: closes in to range, stops, draws, looses. Arrows are its own (like a
 * skeleton's) and can't be picked up.
 */
public final class BowGoal extends Goal {
    private static final double RANGE_SQ = 15 * 15;
    private final AgentEntity agent;
    private int seen;
    private int unseen;
    private int cooldown;

    public BowGoal(AgentEntity agent) {
        this.agent = agent;
        setFlags(EnumSet.of(Flag.MOVE, Flag.LOOK));
    }

    @Override
    public boolean canUse() {
        return Combat.holdsBow(agent) && agent.getTarget() != null && agent.getTarget().isAlive();
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
