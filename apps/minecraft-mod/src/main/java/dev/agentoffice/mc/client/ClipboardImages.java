package dev.agentoffice.mc.client;

import dev.agentoffice.mc.core.AgentOfficeClient;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import net.minecraft.Util;

/**
 * The image on the system clipboard. Minecraft runs Java headless (no AWT clipboard) and GLFW's clipboard is text
 * only, so on Windows PowerShell reads it (a copied image, or an image file copied in Explorer); elsewhere Agent
 * Office's host reads it (wl-paste). Blocking: call on Connection.IO.
 */
final class ClipboardImages {
    record Clip(String filename, String contentType, byte[] data) {}

    private static final String WINDOWS_SCRIPT = """
            $ProgressPreference = 'SilentlyContinue'
            Add-Type -AssemblyName System.Windows.Forms, System.Drawing
            $img = [System.Windows.Forms.Clipboard]::GetImage()
            if ($img) { $img.Save($env:AO_OUT, [System.Drawing.Imaging.ImageFormat]::Png); exit 0 }
            foreach ($f in [System.Windows.Forms.Clipboard]::GetFileDropList()) {
              if ($f -match '\\.(png|jpe?g|gif|webp|bmp)$') { Copy-Item -LiteralPath $f -Destination $env:AO_OUT -Force; 'FILE:' + [IO.Path]::GetFileName($f); exit 0 }
            }
            exit 2
            """;

    private ClipboardImages() {}

    static Optional<Clip> read(AgentOfficeClient client) throws IOException {
        if (Util.getPlatform() == Util.OS.WINDOWS) return windows();
        return client.clipboardImage().map(png -> new Clip(pastedName("png"), "image/png", png));
    }

    private static Optional<Clip> windows() throws IOException {
        Path out = Files.createTempFile("agentoffice-paste", ".img");
        try {
            // Encoded, so no quoting on the way to PowerShell can break the script; -STA for the clipboard API.
            String encoded = Base64.getEncoder().encodeToString(WINDOWS_SCRIPT.getBytes(StandardCharsets.UTF_16LE));
            ProcessBuilder pb = new ProcessBuilder("powershell.exe", "-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", encoded);
            pb.environment().put("AO_OUT", out.toString());
            pb.redirectErrorStream(true);
            Process p = pb.start();
            // Its output is a line or two (progress is silenced), far below a pipe's buffer: waiting first can't deadlock.
            if (!p.waitFor(15, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                throw new IOException("the clipboard didn't answer");
            }
            String said = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            if (p.exitValue() != 0 || Files.size(out) == 0) return Optional.empty();
            byte[] data = Files.readAllBytes(out);
            // Only a copied file names itself (FILE:); anything else on the output (PowerShell's progress records) is noise.
            Optional<String> file = said.lines().filter(l -> l.startsWith("FILE:")).map(l -> l.substring(5).trim()).findFirst();
            if (file.isEmpty() || file.get().isEmpty()) return Optional.of(new Clip(pastedName("png"), "image/png", data));
            return Optional.of(new Clip(file.get(), contentType(file.get()), data));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted", e);
        } finally {
            Files.deleteIfExists(out);
        }
    }

    /** As the web composer names a pasted image. */
    private static String pastedName(String ext) {
        return "pasted-" + System.currentTimeMillis() + "." + ext;
    }

    private static String contentType(String name) {
        String ext = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        return switch (ext) {
            case "jpg", "jpeg" -> "image/jpeg";
            case "gif" -> "image/gif";
            case "webp" -> "image/webp";
            case "bmp" -> "image/bmp";
            default -> "image/png";
        };
    }
}
