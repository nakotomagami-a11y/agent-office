package dev.agentoffice.mc.core;

import java.util.Map;

/**
 * Why a run failed: RUN_ERROR_CODES (packages/domain/src/config/run-errors.ts), each titled as the web titles it
 * (errors.run.*.title in apps/web/messages/en.json). The server's contract test holds this list to both.
 */
public final class RunErrors {
    public static final String UNKNOWN = "unknown";
    /** The player pressed Stop; the web shows a neutral line, not an error, and has no title for it. */
    public static final String STOPPED = "stopped";

    private static final Map<String, String> TITLES = Map.ofEntries(
            Map.entry("stopped", "Stopped"),
            Map.entry("auth_expired", "Sign-in required"),
            Map.entry("subscription_disabled", "Claude access disabled"),
            Map.entry("worktree_missing", "Worktree missing"),
            Map.entry("claude_unavailable", "Claude unavailable"),
            Map.entry("secret_invalid", "Secret check failed"),
            Map.entry("unknown_agent", "Agent unavailable"),
            Map.entry("max_runtime", "Run timed out"),
            Map.entry("spawn_failed", "Couldn't start"),
            Map.entry("already_running", "Still working on the last message"),
            Map.entry("no_output", "No response"),
            Map.entry("server_restart", "Response unavailable"),
            Map.entry("start_failed", "Couldn't start the run"),
            Map.entry("unknown", "Run error"));

    private RunErrors() {}

    /** A newer server's code, unknown here, reads as its words. */
    public static String title(String code) {
        if (code == null || code.isBlank()) return TITLES.get(UNKNOWN);
        return TITLES.getOrDefault(code, code.replace('_', ' '));
    }
}
