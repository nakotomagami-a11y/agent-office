package dev.agentoffice.mc.core;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Every Agent Office API path the mod calls, and nothing else builds one (rule mod.api-paths-one-place). Each method
 * is named after its key in API_ROUTES (packages/api-contract/src/routes.ts) and returns that route; a {name} in a
 * template is a path segment, encoded. apps/server/src/minecraft-mod-contract.test.ts checks every template here
 * against API_ROUTES, so a route renamed on the server fails its tests, not the game.
 */
public final class Routes {
    private Routes() {}

    public static String health() {
        return "/api/health";
    }

    public static String clipboardImage() {
        return "/api/clipboard-image";
    }

    public static String uiSettings() {
        return "/api/ui-settings";
    }

    public static String agents() {
        return "/api/agents";
    }

    public static String agentUploadFile(String agentId, String filename) {
        return fill("/api/agents/{id}/uploads/{filename}", agentId, filename);
    }

    public static String generatedImage(String date, String filename) {
        return fill("/api/generated-images/{date}/{filename}", date, filename);
    }

    public static String projects() {
        return "/api/projects";
    }

    public static String project(String projectId) {
        return fill("/api/projects/{id}", projectId);
    }

    public static String projectRoster(String projectId) {
        return fill("/api/projects/{id}/roster", projectId);
    }

    public static String projectRosterItem(String projectId, String instanceId) {
        return fill("/api/projects/{projectId}/roster/{instanceId}", projectId, instanceId);
    }

    public static String projectUploads(String projectId) {
        return fill("/api/projects/{id}/uploads", projectId);
    }

    public static String projectUploadFile(String projectId, String filename) {
        return fill("/api/projects/{id}/uploads/{filename}", projectId, filename);
    }

    public static String projectReviews(String projectId) {
        return fill("/api/projects/{projectId}/reviews", projectId);
    }

    public static String projectReview(String projectId, int pr) {
        return fill("/api/projects/{projectId}/reviews/{pr}", projectId, String.valueOf(pr));
    }

    public static String conversations() {
        return "/api/conversations";
    }

    /** The slot's current conversation: {@link #conversations()} with the slot as its query. */
    public static String conversationsOf(String agentId, String instanceId) {
        return conversations() + "?agentId=" + enc(agentId) + "&instanceId=" + enc(instanceId);
    }

    public static String conversationMessages(String conversationId) {
        return fill("/api/conversations/{id}/messages", conversationId);
    }

    public static String conversationRetry(String conversationId) {
        return fill("/api/conversations/{id}/retry", conversationId);
    }

    public static String conversationResume(String conversationId) {
        return fill("/api/conversations/{id}/resume", conversationId);
    }

    public static String conversationSkip(String conversationId) {
        return fill("/api/conversations/{id}/skip", conversationId);
    }

    public static String conversationNew(String conversationId) {
        return fill("/api/conversations/{id}/new", conversationId);
    }

    public static String runStream(String runId) {
        return fill("/api/runs/{id}/stream", runId);
    }

    public static String runPermission(String runId) {
        return fill("/api/runs/{id}/permission", runId);
    }

    public static String runAbort(String runId) {
        return fill("/api/runs/{id}/abort", runId);
    }

    /** A path or query segment, percent-encoded (spaces as %20, not +). */
    private static String enc(String segment) {
        return URLEncoder.encode(segment, StandardCharsets.UTF_8).replace("+", "%20");
    }

    /** The template with each {name}, in order, replaced by the next value, encoded. */
    static String fill(String template, String... values) {
        StringBuilder out = new StringBuilder();
        int at = 0;
        for (String v : values) {
            int open = template.indexOf('{', at);
            int close = template.indexOf('}', open);
            if (open < 0 || close < 0) throw new IllegalArgumentException("more values than {} in " + template);
            out.append(template, at, open).append(enc(v));
            at = close + 1;
        }
        if (template.indexOf('{', at) >= 0) throw new IllegalArgumentException("fewer values than {} in " + template);
        return out.append(template.substring(at)).toString();
    }
}
