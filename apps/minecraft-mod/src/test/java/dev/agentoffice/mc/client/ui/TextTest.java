package dev.agentoffice.mc.client.ui;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class TextTest {
    @Test
    void anInheritedSettingSaysSo() {
        assertEquals("opus", Text.setting("opus", "sonnet"));
        assertEquals("default (sonnet)", Text.setting("", "sonnet"));
        assertEquals("default (sonnet)", Text.setting(null, "sonnet"));
        assertEquals("default", Text.setting("", ""));
        assertEquals("default", Text.setting(null, null));
    }

    @Test
    void nullReadsAsEmpty() {
        assertEquals("", Text.nz(null));
        assertEquals("a", Text.nz("a"));
    }
}
