package dev.agentoffice.mc.core;

import java.util.List;
import java.util.Set;

/**
 * Values the mod must spell exactly as Agent Office does, copied because Java can't import them. Each names its
 * source; apps/server/src/minecraft-mod-contract.test.ts holds every one to it.
 */
public final class ServerMirror {
    /** "" (the agent's own default), then MODEL_IDS (packages/domain/src/config/models.ts). */
    public static final List<String> MODELS = List.of("", "haiku", "sonnet", "opus", "fable");
    /** "", then EFFORT_OPTS (packages/domain/src/config/agent-opts.ts). */
    public static final List<String> EFFORTS = List.of("", "low", "medium", "high", "xhigh", "max");
    /** "", then PERMISSION_MODE_OPTS (packages/domain/src/config/agent-opts.ts). */
    public static final List<String> PERMISSION_MODES =
            List.of("", "default", "acceptEdits", "bypassPermissions", "plan", "dontAsk", "auto");
    /** MAX_UPLOAD_BYTES (packages/domain/src/services/infra/paths.ts): a bigger file is refused. */
    public static final long MAX_UPLOAD_BYTES = 50L * 1024 * 1024;
    /** TIMEOUT_MS (packages/domain/src/services/review/gh.ts): how long the server lets one gh call run. */
    public static final long GH_TIMEOUT_MS = 60_000;
    /** composer.attachments_intro (apps/web/messages/en.json): the line before a message's attached paths. */
    public static final String ATTACHMENTS_INTRO = "Attachments (read these with your tools):";
    /** VARIANT_SUFFIXES (apps/web/src/lib/agent-display-name.ts): "developer-lite" reads "Developer (Lite)". */
    public static final Set<String> NAME_VARIANTS = Set.of("lite", "fable", "haiku", "opus", "sonnet");

    private ServerMirror() {}
}
