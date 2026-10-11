package dev.agentoffice.mc.core;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Files sent with a chat message, as the web composer sends them (apps/web/.../build-composed-text.ts). */
public final class Attachments {
    private Attachments() {}

    /** The message text with the uploaded files' paths after it; null when there is nothing to send. */
    public static String compose(String text, List<String> paths) {
        String value = text == null ? "" : text.strip(); // JS trim also takes Unicode spaces
        if (value.isEmpty() && paths.isEmpty()) return null;
        if (paths.isEmpty()) return value;
        StringBuilder out = new StringBuilder(value).append("\n\n").append(ServerMirror.ATTACHMENTS_INTRO);
        for (String p : paths) out.append("\n- ").append(p);
        return out.toString().stripLeading();
    }

    /** One file as a multipart/form-data body in the field "file", which the uploads endpoints read. */
    static byte[] multipart(String boundary, String filename, String contentType, byte[] data) {
        ByteArrayOutputStream out = new ByteArrayOutputStream(data.length + 256);
        String safeName = filename.replace("\"", "").replace("\r", "").replace("\n", "");
        byte[] head = ("--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"" + safeName + "\"\r\n"
                + "Content-Type: " + contentType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8);
        out.writeBytes(head);
        out.writeBytes(data);
        out.writeBytes(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return out.toByteArray();
    }
}
