package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class AgentLooksTest {
    @Test
    void agentsGetTheirCharacter() {
        assertEquals("kit", AgentLooks.castFor("developer"));
        assertEquals("kit", AgentLooks.castFor("developer-lite"));
        assertEquals("rowan", AgentLooks.castFor("qa-code-review"));
        assertEquals("tove", AgentLooks.castFor("qa-visual"), "the narrower prefix wins over qa-");
        assertEquals("tove", AgentLooks.castFor("tech-writer"));
        assertEquals("wren", AgentLooks.castFor("frontend-craftsman"));
        assertEquals("marlow", AgentLooks.castFor("cs-cto"));
        assertEquals("juniper", AgentLooks.castFor("Explore"));
        assertNull(AgentLooks.castFor("claude"), "no character: a default Minecraft skin");
    }

    @Test
    void slimArmsFollowTheCharacter() {
        assertTrue(AgentLooks.slim("wren"));
        assertFalse(AgentLooks.slim("kit"));
    }

    @Test
    void onlyPlainNamesCanNameASkinFile() {
        assertTrue(AgentLooks.fileSafe("qa-code-review"));
        assertTrue(AgentLooks.fileSafe("developer_2.1"));
        assertFalse(AgentLooks.fileSafe("../developer"));
        assertFalse(AgentLooks.fileSafe(".hidden"));
        assertFalse(AgentLooks.fileSafe("a/b"));
        assertFalse(AgentLooks.fileSafe("a\\b"));
        assertFalse(AgentLooks.fileSafe(""));
    }
}
