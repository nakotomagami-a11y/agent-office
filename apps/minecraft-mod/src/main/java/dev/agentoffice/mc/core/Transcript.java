package dev.agentoffice.mc.core;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * The chat thread, built like the web chat's: {@code turnToThreadItems}
 * (apps/web/src/modules/summon/format/conversation-to-thread.ts) for finished turns and
 * {@code applySseEvent} (parse-sse-event.ts) for the live run. Items are immutable; a change
 * replaces the item, so a renderer can cache layout per item identity.
 */
public final class Transcript {
    public sealed interface Item permits You, Tool, AgentText, Failure, Done, Note, SubAgent, RateLimit {}

    /** A sub-agent this run spawned; stands in for the suppressed spawn tool row. */
    public record SubAgent(String subRunId, String name, String status, String currentTool, String lastLine) implements Item {
        public boolean running() {
            return "running".equals(status) || "queued".equals(status) || "cancelling".equals(status);
        }
    }

    /** {@code limit} = hit the limit; otherwise a warning. */
    public record RateLimit(String message, boolean limit) implements Item {}

    /** {@code text} is the raw prompt: its attachment footer is where the images are; strip it for display. */
    public record You(String text, boolean system) implements Item {}

    /** {@code arg} is the compact display form (see {@link #toolArg}), null when there's nothing to show. */
    public record Tool(String id, String name, String arg, boolean running) implements Item {}

    public record AgentText(String text, boolean streaming) implements Item {}

    public record Failure(String code, String detail) implements Item {}

    public record Done(int exitCode, long durationMs, long tokensIn, long tokensOut, double cost) implements Item {}

    public record Note(String text, boolean warning) implements Item {}

    private Transcript() {}

    /** Every finished turn's items, then the active turn's prompt; the live run's items follow it. */
    public static List<Item> history(Api.Conversation c) {
        List<Item> out = new ArrayList<>();
        for (Api.Turn t : c.turns()) {
            boolean active = c.running() && c.activeRunId().equals(t.runId());
            if (active) {
                out.add(new You(t.prompt() == null ? "" : t.prompt(), t.fromSystem()));
            } else {
                out.addAll(turn(t));
            }
        }
        return out;
    }

    static List<Item> turn(Api.Turn t) {
        List<Item> items = new ArrayList<>();
        if (t.prompt() != null) items.add(new You(t.prompt(), t.fromSystem()));
        for (Api.ToolCall tc : t.toolCalls()) {
            JsonElement input = parseInput(tc.input());
            if (isSubAgentSpawn(tc.name(), input)) continue;
            items.add(new Tool(tc.id(), tc.name(), toolArg(input), false));
        }
        if (t.output() != null && !t.output().isBlank()) items.add(new AgentText(t.output(), false));
        if ("error".equals(t.status())) {
            items.add(new Failure("unknown", null));
        } else if ("done".equals(t.status())) {
            items.add(new Done(t.exitCode() == null ? 0 : t.exitCode(), t.durMs(), t.tokensIn(), t.tokensOut(), t.cost()));
        }
        return items;
    }

    /** The live run's items, built from its event stream (attached resets: the server replays everything after it). */
    public static final class Live {
        private final List<Item> items = new ArrayList<>();
        private long tokensIn;
        private long tokensOut;
        private double cost;
        private long startTs;
        private boolean ended;

        public List<Item> items() {
            return items;
        }

        public boolean ended() {
            return ended;
        }

        /** Name of the running tool, or of a running sub-agent; null when neither. */
        public String runningTool() {
            for (int i = items.size() - 1; i >= 0; i--) {
                if (items.get(i) instanceof Tool t && t.running()) return t.name();
                if (items.get(i) instanceof SubAgent s && s.running()) return s.name();
            }
            return null;
        }

        /** Applies one stream event; returns false for events it doesn't know or can't parse. */
        public boolean apply(Api.Event event) {
            JsonObject data;
            try {
                data = JsonParser.parseString(event.data()).getAsJsonObject();
            } catch (RuntimeException e) {
                return false;
            }
            switch (event.name()) {
                case "attached" -> {
                    items.clear();
                    ended = false;
                    startTs = num(data, "startTs");
                    usage(data);
                }
                case "chunk" -> {
                    String text = str(data, "text");
                    if (text.isEmpty()) return true;
                    int last = items.size() - 1;
                    if (last >= 0 && items.get(last) instanceof AgentText a && a.streaming()) {
                        items.set(last, new AgentText(a.text() + text, true));
                    } else {
                        items.add(new AgentText(text, true));
                    }
                }
                case "tool" -> tool(data);
                case "tool-done" -> {
                    int at = toolAt(str(data, "toolUseId"));
                    if (at >= 0 && items.get(at) instanceof Tool t) items.set(at, new Tool(t.id(), t.name(), t.arg(), false));
                }
                case "subagent" -> {
                    // The spawn's tool row was suppressed; this card stands in for it (parse-sse-event.ts).
                    SubAgent card = new SubAgent(str(data, "subRunId"), str(data, "agentId"), str(data, "status"), null, null);
                    int at = subAgentAt(str(data, "subRunId"));
                    if (at >= 0) items.set(at, card);
                    else items.add(card);
                }
                case "subagent-update" -> {
                    int at = subAgentAt(str(data, "subRunId"));
                    if (at >= 0 && items.get(at) instanceof SubAgent s) {
                        String tool = str(data, "currentTool");
                        String line = str(data, "lastOutputLine");
                        items.set(at, new SubAgent(s.subRunId(), s.name(), str(data, "status"),
                                tool.isEmpty() ? null : tool, line.isEmpty() ? null : line));
                    }
                }
                case "usage" -> usage(data);
                case "done" -> {
                    finish("done");
                    usage(data);
                    long dur = num(data, "durationMs");
                    if (dur == 0 && startTs > 0) dur = System.currentTimeMillis() - startTs;
                    int exit = data.has("exitCode") && !data.get("exitCode").isJsonNull() ? data.get("exitCode").getAsInt() : 0;
                    items.add(new Done(exit, dur, tokensIn, tokensOut, cost));
                }
                case "error" -> {
                    finish("error");
                    String detail = str(data, "detail");
                    items.add(new Failure(str(data, "code"), detail.isEmpty() ? null : detail));
                }
                case "rate-limit" -> rateLimit(data);
                default -> {
                    return false;
                }
            }
            return true;
        }

        /** applyToolEvent (tool-item.ts): dedupe by toolUseId, drop spawns, never blank an arg. */
        private void tool(JsonObject data) {
            String id = str(data, "toolUseId");
            String name = str(data, "name");
            JsonElement input = data.get("input");
            int at = id.isEmpty() ? -1 : toolAt(id);
            if (isSubAgentSpawn(name, input)) {
                // Spotting a `claude -p --agent` spawn needs the command; the input-less first fire added a row.
                if (at >= 0) items.remove(at);
                return;
            }
            String arg = toolArg(input);
            if (at < 0) {
                // A *new* row ends the text above it; an update must not (more text can follow a tool_use).
                closeStreaming();
                items.add(new Tool(id, name, arg, true));
            } else if (arg != null && items.get(at) instanceof Tool t && !arg.equals(t.arg())) {
                items.set(at, new Tool(t.id(), name, arg, t.running()));
            }
        }

        /** The CLI re-reports a rate limit on every tool call: one card, updated in place. */
        private void rateLimit(JsonObject data) {
            String message = str(data, "message");
            int last = items.size() - 1;
            if (last >= 0 && items.get(last) instanceof AgentText a && echoes(a.text(), message)) items.remove(last);
            // A missing severity means "limit", as in the web's schema default.
            RateLimit card = new RateLimit(message, !"warning".equals(str(data, "severity")));
            int at = -1;
            for (int i = items.size() - 1; i >= 0; i--) {
                if (items.get(i) instanceof RateLimit) {
                    at = i;
                    break;
                }
            }
            if (at >= 0) items.set(at, card);
            else items.add(card);
            closeStreaming();
        }

        private static boolean echoes(String text, String message) {
            String a = text.trim().replaceAll("…$", "").trim();
            String b = message.trim().replaceAll("…$", "").trim();
            return !a.isEmpty() && !b.isEmpty() && (a.equals(b) || a.contains(b) || b.contains(a));
        }

        private int toolAt(String id) {
            for (int i = 0; i < items.size(); i++) {
                if (items.get(i) instanceof Tool t && id.equals(t.id())) return i;
            }
            return -1;
        }

        private int subAgentAt(String subRunId) {
            if (subRunId.isEmpty()) return -1;
            for (int i = 0; i < items.size(); i++) {
                if (items.get(i) instanceof SubAgent s && subRunId.equals(s.subRunId())) return i;
            }
            return -1;
        }

        private void usage(JsonObject data) {
            if (data.has("tokensIn") && !data.get("tokensIn").isJsonNull()) tokensIn = data.get("tokensIn").getAsLong();
            if (data.has("tokensOut") && !data.get("tokensOut").isJsonNull()) tokensOut = data.get("tokensOut").getAsLong();
            if (data.has("cost") && !data.get("cost").isJsonNull()) cost = data.get("cost").getAsDouble();
        }

        private void closeStreaming() {
            for (int i = 0; i < items.size(); i++) {
                if (items.get(i) instanceof AgentText a && a.streaming()) items.set(i, new AgentText(a.text(), false));
            }
        }

        /** Ends the run; sub-agents still marked running get {@code subAgentStatus} (done, or error on a failed run). */
        private void finish(String subAgentStatus) {
            ended = true;
            closeStreaming();
            for (int i = 0; i < items.size(); i++) {
                if (items.get(i) instanceof Tool t && t.running()) items.set(i, new Tool(t.id(), t.name(), t.arg(), false));
                if (items.get(i) instanceof SubAgent s && s.running()) {
                    items.set(i, new SubAgent(s.subRunId(), s.name(), subAgentStatus, null, s.lastLine()));
                }
            }
        }
    }

    private static final Pattern CLAUDE_CALL = Pattern.compile("(^|[\\s;&|(])claude(\\s|$)");
    private static final Pattern PRINT_FLAG = Pattern.compile("(^|\\s)(-p|--print)(\\s|=|$)");
    private static final Pattern AGENT_FLAG = Pattern.compile("--agent(\\s|=)");
    private static final List<String> ARG_KEYS =
            List.of("command", "file_path", "path", "pattern", "url", "query", "description", "prompt", "skill");

    /** Sub-agent spawns get their own card in the web chat, never a tool row (tool-item.ts). */
    static boolean isSubAgentSpawn(String name, JsonElement input) {
        if ("Task".equals(name) || "Agent".equals(name)) return true;
        if (input == null || !input.isJsonObject()) return false;
        JsonObject o = input.getAsJsonObject();
        if (isString(o, "subagent_type")) return true;
        if (isString(o, "description") && isString(o, "prompt")) return true;
        if ("Bash".equals(name) && isString(o, "command")) {
            String cmd = o.get("command").getAsString();
            return CLAUDE_CALL.matcher(cmd).find() && PRINT_FLAG.matcher(cmd).find() && AGENT_FLAG.matcher(cmd).find();
        }
        return false;
    }

    /** One line worth showing next to the tool name: its main field, else the JSON; null for nothing. */
    static String toolArg(JsonElement input) {
        if (input == null || input.isJsonNull()) return null;
        if (input.isJsonPrimitive()) {
            String s = input.getAsString().trim();
            return s.isEmpty() ? null : s;
        }
        if (input.isJsonObject()) {
            JsonObject o = input.getAsJsonObject();
            if (o.size() == 0) return null;
            for (String key : ARG_KEYS) {
                if (isString(o, key)) return o.get(key).getAsString().replace('\n', ' ');
            }
        }
        if (input.isJsonArray() && input.getAsJsonArray().isEmpty()) return null;
        return input.toString();
    }

    /** Persisted tool input is a JSON string; anything unparseable stays the raw string. */
    static JsonElement parseInput(String stored) {
        if (stored == null || stored.isBlank()) return null;
        try {
            return JsonParser.parseString(stored);
        } catch (RuntimeException e) {
            return new com.google.gson.JsonPrimitive(stored);
        }
    }

    private static final Pattern ATTACHMENT_FOOTER =
            Pattern.compile("(?:\\n\\n)?Attachments \\(read these with your tools\\):[^\\n]*(?:\\n- [^\\n]+)*");

    /** The footer the composer appends for attachments isn't shown as text (message-format.ts). */
    public static String stripAttachmentFooter(String text) {
        return text == null ? "" : ATTACHMENT_FOOTER.matcher(text).replaceAll("").trim();
    }

    /** 5312 → "5.3k", 420 → "420". */
    public static String fmtTok(long n) {
        return n >= 1000 ? String.format(java.util.Locale.ROOT, "%.1fk", n / 1000.0) : String.valueOf(n);
    }

    public static String fmtDuration(long ms) {
        long sec = Math.round(ms / 1000.0);
        if (sec < 60) return sec + "s";
        long m = sec / 60;
        long s = sec % 60;
        if (m < 60) return s > 0 ? m + "m " + s + "s" : m + "m";
        long h = m / 60;
        long rm = m % 60;
        return rm > 0 ? h + "h " + rm + "m" : h + "h";
    }

    public static String fmtCost(double cost) {
        return String.format(java.util.Locale.ROOT, "$%.2f", cost);
    }

    private static boolean isString(JsonObject o, String key) {
        return o.has(key) && o.get(key).isJsonPrimitive() && o.get(key).getAsJsonPrimitive().isString();
    }

    private static long num(JsonObject o, String key) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsLong() : 0;
    }

    private static String str(JsonObject o, String key) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : "";
    }
}
