package dev.agentoffice.mc.core;

/**
 * An agent's level from the XP it has earned in all (kills, and slowly its work). Every agent starts at level 1;
 * level n → n + 1 costs 20 + 10·n XP, so each level takes a little longer than the last.
 */
public final class Levels {
    private Levels() {}

    /** XP from level {@code level} to the next. */
    public static int cost(int level) {
        return 20 + 10 * level;
    }

    public static int levelOf(int xp) {
        int level = 1;
        for (int left = Math.max(0, xp); left >= cost(level); level++) left -= cost(level);
        return level;
    }

    /** XP earned towards the next level. */
    public static int progress(int xp) {
        int left = Math.max(0, xp);
        for (int level = 1; left >= cost(level); level++) left -= cost(level);
        return left;
    }
}
