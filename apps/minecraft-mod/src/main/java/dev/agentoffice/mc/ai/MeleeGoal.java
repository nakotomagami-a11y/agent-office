package dev.agentoffice.mc.ai;

import dev.agentoffice.mc.AgentEntity;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;

/** Hits with what it holds (a bare hand too), unless that is a bow. */
public final class MeleeGoal extends MeleeAttackGoal {
    private final AgentEntity agent;

    public MeleeGoal(AgentEntity agent) {
        super(agent, 1.0, true);
        this.agent = agent;
    }

    @Override
    public boolean canUse() {
        return !Combat.holdsBow(agent) && super.canUse();
    }

    @Override
    public boolean canContinueToUse() {
        return !Combat.holdsBow(agent) && super.canContinueToUse();
    }
}
