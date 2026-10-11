package dev.agentoffice.mc.client.service;

import dev.agentoffice.mc.ModPaths;
import dev.agentoffice.mc.core.AgentOfficeClient;
import dev.agentoffice.mc.core.ChatSession.Upload;
import dev.agentoffice.mc.core.Ids;
import dev.agentoffice.mc.core.ServerMirror;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import net.minecraft.Util;
import org.slf4j.Logger;

/**
 * The image on the system clipboard. Minecraft runs Java headless (no AWT clipboard) and GLFW's clipboard is text
 * only, so on Windows PowerShell reads it (a copied image, or an image file copied in Explorer); on Linux Agent
 * Office's host reads it (wl-paste). Blocking: call on AgentOffice.IO.
 */
public final class ClipboardImages {

    private static final Logger LOG = Ids.LOG;
    /** The script's "nothing on the clipboard"; any other failure is an error. */
    private static final int EMPTY = 2;

    private static final String WINDOWS_SCRIPT = """
            $ProgressPreference = 'SilentlyContinue'
            $ErrorActionPreference = 'Stop'
            Add-Type -AssemblyName System.Windows.Forms, System.Drawing
            $img = [System.Windows.Forms.Clipboard]::GetImage()
            if ($img) { $img.Save($env:AO_OUT, [System.Drawing.Imaging.ImageFormat]::Png); 'EXT:png'; exit 0 }
            foreach ($f in [System.Windows.Forms.Clipboard]::GetFileDropList()) {
              if ($f -match '\\.(png|jpe?g|gif|webp|bmp)$') {
                Copy-Item -LiteralPath $f -Destination $env:AO_OUT -Force; 'EXT:' + $Matches[1].ToLower(); exit 0
              }
            }
            exit 2
            """;

    private ClipboardImages() {}

    public static Optional<Upload> read(AgentOfficeClient client) throws IOException {
        if (Util.getPlatform() == Util.OS.WINDOWS) return windows();
        if (Util.getPlatform() == Util.OS.OSX) throw new IOException("image paste isn't supported on macOS yet");
        return client.clipboardImage().map(png -> new Upload(pastedName("png"), "image/png", png));
    }

    private static Optional<Upload> windows() throws IOException {
        Path out = ModPaths.pasteTemp();
        Process p = null;
        try {
            // Encoded, so no quoting on the way can break it and no execution policy blocks it; -STA for the clipboard.
            String encoded = Base64.getEncoder().encodeToString(WINDOWS_SCRIPT.getBytes(StandardCharsets.UTF_16LE));
            ProcessBuilder pb = new ProcessBuilder("powershell.exe", "-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", encoded);
            pb.environment().put("AO_OUT", out.toString());
            // Error records can be long: they must never fill a pipe nobody reads while we wait.
            pb.redirectError(ProcessBuilder.Redirect.DISCARD);
            p = pb.start();
            // Its output is one short line, far below a pipe's buffer: waiting first can't deadlock.
            if (!p.waitFor(15, TimeUnit.SECONDS)) throw new IOException("the clipboard didn't answer");
            String said = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (p.exitValue() == EMPTY) return Optional.empty();
            if (p.exitValue() != 0) throw new IOException("couldn't read the clipboard (PowerShell exit " + p.exitValue() + ")");
            long size = Files.size(out);
            if (size == 0) return Optional.empty();
            if (size > ServerMirror.MAX_UPLOAD_BYTES) {
                throw new IOException("the image is over Agent Office's " + ServerMirror.MAX_UPLOAD_BYTES / (1024 * 1024) + " MB limit");
            }
            String ext = said.lines().filter(l -> l.startsWith("EXT:")).map(l -> l.substring(4).trim()).findFirst().orElse("png");
            // Named as the web composer names a paste: never a copied file's own name, which could replace an earlier
            // upload of the same name that an older message points to.
            return Optional.of(new Upload(pastedName(ext), contentType(ext), Files.readAllBytes(out)));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted", e);
        } finally {
            if (p != null && p.isAlive()) {
                try {
                    p.destroyForcibly().waitFor(2, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            try {
                Files.deleteIfExists(out);
            } catch (IOException e) {
                LOG.warn("couldn't delete the pasted image's temp file {}: {}", out, e.toString());
            }
        }
    }

    private static String pastedName(String ext) {
        return "pasted-" + System.currentTimeMillis() + "." + ext;
    }

    private static String contentType(String ext) {
        return switch (ext.toLowerCase(Locale.ROOT)) {
            case "jpg", "jpeg" -> "image/jpeg";
            case "gif" -> "image/gif";
            case "webp" -> "image/webp";
            case "bmp" -> "image/bmp";
            default -> "image/png";
        };
    }
}
