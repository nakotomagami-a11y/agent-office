package dev.agentoffice.mc;

import static org.junit.jupiter.api.Assertions.assertEquals;

import dev.agentoffice.mc.core.Markdown;
import dev.agentoffice.mc.core.Transcript;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * The compiler's exhaustiveness check, by hand: the Fabric 1.20.1 build is Java 17, so these sealed types are walked
 * with instanceof chains, which a new subtype would fall through at render time. A new one fails here instead.
 */
class SealedBranchesTest {
    private static Set<String> permitted(Class<?> sealed) {
        return Arrays.stream(sealed.getPermittedSubclasses()).map(Class::getSimpleName).collect(Collectors.toSet());
    }

    @Test
    void everyTranscriptItemHasABranch() {
        assertEquals(Set.of("You", "Tool", "AgentText", "Failure", "Done", "Note", "SubAgent", "RateLimit"),
                permitted(Transcript.Item.class), "add a branch in TranscriptView.itemParts, then here");
    }

    @Test
    void everyMarkdownBlockHasABranch() {
        assertEquals(Set.of("Heading", "Paragraph", "ListBlock", "Code", "Table"),
                permitted(Markdown.Block.class), "add a branch in TranscriptView.agentParts, then here");
    }

    @Test
    void everyRosterEntryHasABranch() throws ClassNotFoundException {
        assertEquals(Set.of("Group", "Session", "Add"),
                permitted(Class.forName("dev.agentoffice.mc.client.screen.WorkspaceScreen$Entry")),
                "add a branch in WorkspaceScreen.init's roster loop, then here");
    }
}
