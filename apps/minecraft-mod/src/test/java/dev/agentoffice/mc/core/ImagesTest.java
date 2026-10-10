package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import org.junit.jupiter.api.Test;

class ImagesTest {
    @Test
    void uploadsOnWindowsAndPosixBecomeApiPaths() {
        String text = "See C:\\Users\\me\\.claude\\projects\\p1\\_uploads\\shot.png and "
                + "/home/me/.claude/agents/_uploads/developer/diagram.JPG, done.";
        assertEquals(List.of(
                "/api/projects/p1/uploads/shot.png",
                "/api/agents/developer/uploads/diagram.JPG"), Images.extract(text));
    }

    @Test
    void generatedImagesSurviveTheSpaceInTheirFolder() {
        String text = "Saved to C:/Users/me/Documents/Generated Images/2026-10-09/cat 1.png.";
        // A space in the file name ends the match in the web regex too: no image rather than a wrong one.
        assertEquals(List.of(), Images.extract(text));
        assertEquals(List.of("/api/generated-images/2026-10-09/castle.png"),
                Images.extract("Done: C:\\Users\\me\\Documents\\Generated Images\\2026-10-09\\castle.png!".replace('\\', '/')));
    }

    @Test
    void undecodableAndRemoteImagesAreSkippedAndDuplicatesCollapse() {
        String text = "/x/.claude/projects/p/_uploads/a.webp https://example.com/b.png "
                + "/x/.claude/projects/p/_uploads/c.gif /x/.claude/projects/p/_uploads/c.gif";
        assertEquals(List.of("/api/projects/p/uploads/c.gif"), Images.extract(text));
    }
}
