package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AgentNamesTest {
    @Test
    void idsReadLikeTheWebAppShowsThem() {
        assertEquals("CEO", AgentNames.format("cs-ceo"));
        assertEquals("Developer", AgentNames.format("developer"));
        assertEquals("Developer (Lite)", AgentNames.format("developer-lite"));
        assertEquals("QA Code Review", AgentNames.format("qa-code-review"));
        assertEquals("Cs Boardroom", AgentNames.format("cs-boardroom"));
        assertEquals("", AgentNames.format(null));
        assertEquals("Developer ", AgentNames.format("developer-"), "hyphens kept as the web app keeps them");
        assertEquals(" X", AgentNames.format("-x"));
    }

    @Test
    void aStoredNameWinsAndForgettingItFallsBackToTheId() {
        AgentNames.remember("names-test-agent", "  Business Council ");
        assertEquals("Business Council", AgentNames.of("names-test-agent"));
        AgentNames.remember("names-test-agent", null);
        assertEquals("Names Test Agent", AgentNames.of("names-test-agent"));
    }

    @Test
    void aSeatsLabelStillComesFirst() {
        assertEquals("Reviewer", new Api.Slot("p", "P", "qa-code-review", "i", "Reviewer").displayName());
        assertEquals("QA Code Review", new Api.Slot("p", "P", "qa-code-review", "i", " ").displayName());
    }
}
