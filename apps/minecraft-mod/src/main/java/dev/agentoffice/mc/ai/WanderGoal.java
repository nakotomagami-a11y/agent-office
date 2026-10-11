package dev.agentoffice.mc.ai;

import dev.agentoffice.mc.AgentEntity;
import java.util.EnumSet;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.util.LandRandomPos;
import net.minecraft.world.level.pathfinder.Path;
import net.minecraft.world.phys.Vec3;

/** Back inside its anchor when it strayed (after a fight, say), else an occasional stroll within it. */
public final class WanderGoal extends Goal {
    private final AgentEntity agent;
    private Vec3 dest;
    private double speed;
    /** After a route that can't get there (a pit, a fenced-off lectern): wait, don't search every other tick. */
    private int retryAt;

    public WanderGoal(AgentEntity agent) {
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
