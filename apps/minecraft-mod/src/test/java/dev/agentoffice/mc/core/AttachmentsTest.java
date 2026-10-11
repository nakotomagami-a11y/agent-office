package dev.agentoffice.mc.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;

class AttachmentsTest {
    @Test
    void theMessageListsItsFilesAsTheWebComposerDoes() {
        assertEquals("look\n\nAttachments (read these with your tools):\n- D:/up/a.png\n- D:/up/b.png",
                Attachments.compose("  look ", List.of("D:/up/a.png", "D:/up/b.png")));
        assertEquals("Attachments (read these with your tools):\n- D:/up/a.png", Attachments.compose("", List.of("D:/up/a.png")),
                "an image alone is a message");
        assertEquals("just text", Attachments.compose("just text ", List.of()));
        assertNull(Attachments.compose("   ", List.of()));
    }

    @Test
    void anUploadIsOneFileFieldTheServerCanRead() {
        String body = new String(Attachments.multipart("B", "pasted-1.png", "image/png", new byte[] {1, 2}), StandardCharsets.ISO_8859_1);
        assertEquals("--B\r\nContent-Disposition: form-data; name=\"file\"; filename=\"pasted-1.png\"\r\n"
                + "Content-Type: image/png\r\n\r\n\u0001\u0002\r\n--B--\r\n", body);
        assertTrue(new String(Attachments.multipart("B", "a\"b\r\n.png", "image/png", new byte[0]), StandardCharsets.UTF_8)
                .contains("filename=\"ab.png\""), "a name can't break out of its header");
    }
}
