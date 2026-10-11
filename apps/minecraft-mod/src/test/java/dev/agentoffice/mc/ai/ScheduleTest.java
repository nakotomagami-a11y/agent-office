package dev.agentoffice.mc.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import net.minecraft.core.BlockPos;
import org.junit.jupiter.api.Test;

class ScheduleTest {
    private static final BlockPos HOME = new BlockPos(0, 64, 0);
    private static final BlockPos DESK = new BlockPos(10, 64, 0);
    private static final BlockPos BELL = new BlockPos(-20, 64, 5);
    private static final long NOON = 6000;

    @Test
    void anAgentKeepsNearWhatItIsDoing() {
        assertNull(Schedule.anchor(null, false, null, null, NOON), "not placed yet");
        assertEquals(new Anchor(HOME, 1, Integer.MAX_VALUE), Schedule.anchor(HOME, true, DESK, BELL, NOON), "a shell keeps to its spot");
        assertEquals(new Anchor(DESK, 3, 200), Schedule.anchor(HOME, false, DESK, BELL, 10_000), "work beats the meeting");
        assertEquals(new Anchor(HOME, 12, 60), Schedule.anchor(HOME, false, null, null, NOON), "no village: where it was put");
        assertEquals(new Anchor(BELL, 32, 60), Schedule.anchor(HOME, false, null, BELL, NOON), "about the village");
        assertEquals(new Anchor(BELL, 5, 80), Schedule.anchor(HOME, false, null, BELL, 9000), "the meeting starts");
        assertEquals(new Anchor(BELL, 32, 60), Schedule.anchor(HOME, false, null, BELL, 11_000), "and ends");
        assertEquals(new Anchor(BELL, 5, 80), Schedule.anchor(HOME, false, null, BELL, 24_000 * 3 + 10_000), "every day");
    }
}
