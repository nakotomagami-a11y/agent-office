package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class LevelsTest {
    @Test
    void describesALevelAndTheWayToTheNext() {
        assertEquals("Level 1 · 0/30 XP", Levels.describe(0));
        assertEquals("Level 2 · 5/40 XP", Levels.describe(35));
    }

    @Test
    void levelsCostALittleMoreEachTime() {
        assertEquals(30, Levels.cost(1));
        assertEquals(40, Levels.cost(2));
        assertEquals(1, Levels.levelOf(0));
        assertEquals(1, Levels.levelOf(29));
        assertEquals(2, Levels.levelOf(30));
        assertEquals(2, Levels.levelOf(69));
        assertEquals(3, Levels.levelOf(70));
        assertEquals(0, Levels.progress(70));
        assertEquals(12, Levels.progress(82));
        assertEquals(1, Levels.levelOf(-5), "never below 1");
    }
}
