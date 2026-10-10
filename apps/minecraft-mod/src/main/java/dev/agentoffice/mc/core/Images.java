package dev.agentoffice.mc.core;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Image paths in a message → the Agent Office URLs that serve them, like the web chat's
 * {@code extractImages}/{@code pathToUrl} (apps/web/src/modules/summon/format/message-format.ts).
 * Differences: only formats the game can decode (no webp/svg/ico), and no remote http(s) images —
 * the mod only ever talks to Agent Office on this machine.
 */
public final class Images {
    private Images() {}

    private static final Pattern DECODABLE = Pattern.compile("\\.(png|jpe?g|gif|bmp)$", Pattern.CASE_INSENSITIVE);
    /** What /api/generated-images serves (GENERATED_IMAGE_EXT) minus webp, which the game can't decode. */
    private static final Pattern GENERATED_EXT = Pattern.compile("\\.(png|jpe?g|gif)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern PATH = Pattern.compile("((?:[A-Za-z]:)?[\\\\/][^\\s,'\"<>()\\[\\]]+)");
    // The folder name has a space, which PATH splits on.
    private static final Pattern GENERATED = Pattern.compile("/Generated Images/\\d{4}-\\d{2}-\\d{2}/[^\\s,'\"`*<>()\\[\\]]{1,255}");
    private static final Pattern AGENT_UPLOAD = Pattern.compile("\\.claude/agents/_uploads/([^/\\s]+)/([^/\\s]+)$");
    private static final Pattern PROJECT_UPLOAD = Pattern.compile("\\.claude/projects/([^/\\s]+)/_uploads/([^/\\s]+)$");
    private static final Pattern GENERATED_FILE = Pattern.compile("/Generated Images/(\\d{4}-\\d{2}-\\d{2})/([^/\\s]+)$");

    /** Agent Office paths of the images a message refers to, in order, without duplicates. */
    public static List<String> extract(String text) {
        Set<String> urls = new LinkedHashSet<>();
        if (text == null || text.isEmpty()) return new ArrayList<>(urls);
        Matcher m = PATH.matcher(text);
        while (m.find()) {
            String url = toUrl(m.group(1));
            if (url != null) urls.add(url);
        }
        Matcher g = GENERATED.matcher(text);
        while (g.find()) {
            String raw = g.group();
            int end = raw.length();
            while (end > 0 && ".:;!?".indexOf(raw.charAt(end - 1)) >= 0) end--;
            String url = toUrl(raw.substring(0, end));
            if (url != null) urls.add(url);
        }
        return new ArrayList<>(urls);
    }

    /** A local upload or generated-image path → its API path; null for anything else. */
    static String toUrl(String rawPath) {
        String raw = rawPath.replace('\\', '/');
        Matcher agent = AGENT_UPLOAD.matcher(raw);
        if (agent.find() && DECODABLE.matcher(agent.group(2)).find()) {
            return "/api/agents/" + enc(agent.group(1)) + "/uploads/" + enc(agent.group(2));
        }
        Matcher project = PROJECT_UPLOAD.matcher(raw);
        if (project.find() && DECODABLE.matcher(project.group(2)).find()) {
            return "/api/projects/" + enc(project.group(1)) + "/uploads/" + enc(project.group(2));
        }
        Matcher gen = GENERATED_FILE.matcher(raw);
        if (gen.find() && GENERATED_EXT.matcher(gen.group(2)).find()) {
            return "/api/generated-images/" + enc(gen.group(1)) + "/" + enc(gen.group(2));
        }
        return null;
    }

    private static String enc(String segment) {
        return URLEncoder.encode(segment, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
