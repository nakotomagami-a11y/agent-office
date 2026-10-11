package dev.agentoffice.mc.ai;

import net.minecraft.core.BlockPos;

/**
 * Where an agent keeps near, decided in one place, villager-like: its lectern while it works, the village bell at
 * meeting time, the village otherwise, or where it was put when there is no village. A new behaviour is a new rule
 * here (and maybe a goal).
 */
public final class Schedule {
    /** Villagers meet at the bell in the afternoon (their schedule's MEET). */
    static final int MEET_FROM = 9000;
    static final int MEET_UNTIL = 11000;

    private Schedule() {}

    /**
     * {@code workplace}: its lectern while it works, else null; {@code bell}: its village's, if it has one. Null
     * without a home (not placed yet).
     */
    public static Anchor anchor(BlockPos home, boolean shell, BlockPos workplace, BlockPos bell, long dayTime) {
        if (home == null) return null;
        if (shell) return new Anchor(home, 1, Integer.MAX_VALUE);
        if (workplace != null) return new Anchor(workplace, 3, 200);
        if (bell == null) return new Anchor(home, 12, 60);
        long time = dayTime % 24000;
        return time >= MEET_FROM && time < MEET_UNTIL ? new Anchor(bell, 5, 80) : new Anchor(bell, 32, 60);
    }
}
