package dev.agentoffice.mc.core;

/**
 * The words Agent Office's API answers in, each spelled once (rule mod.status-vocab). Each nested class mirrors one
 * TypeScript vocabulary, named in its doc; apps/server/src/minecraft-mod-contract.test.ts checks every value against it.
 */
public final class Protocol {
    private Protocol() {}

    /** ConversationStatus (packages/domain/src/types/index.ts). */
    public static final class Conversation {
        public static final String IDLE = "idle";
        public static final String RUNNING = "running";
        public static final String NEEDS_ATTENTION = "needs_attention";

        private Conversation() {}
    }

    /** PersistedRun.status (packages/domain/src/types/index.ts): one turn of a conversation. */
    public static final class Turn {
        public static final String RUNNING = "running";
        public static final String DONE = "done";
        public static final String ERROR = "error";

        private Turn() {}
    }

    /** SubAgentStatus (packages/domain/src/types/index.ts). */
    public static final class SubAgent {
        public static final String QUEUED = "queued";
        public static final String RUNNING = "running";
        public static final String CANCELLING = "cancelling";
        public static final String DONE = "done";
        public static final String ERROR = "error";

        private SubAgent() {}
    }

    /** SseEvent names (packages/domain/src/services/execution/runs/types.ts): what a run's stream sends. */
    public static final class Event {
        public static final String ATTACHED = "attached";
        public static final String PERMISSION_REQUEST = "permission-request";
        public static final String CHUNK = "chunk";
        public static final String TOOL = "tool";
        public static final String TOOL_DONE = "tool-done";
        public static final String USAGE = "usage";
        public static final String DONE = "done";
        public static final String ERROR = "error";
        public static final String RATE_LIMIT = "rate-limit";
        public static final String SUBAGENT = "subagent";
        public static final String SUBAGENT_UPDATE = "subagent-update";

        private Event() {}
    }

    /** What a conversation can be told to do: each is its own route (API_ROUTES.conversationRetry, ...). */
    public enum Action {
        RETRY, RESUME, SKIP, NEW;

        /** "Retry": its button's label. */
        public String label() {
            return name().charAt(0) + name().substring(1).toLowerCase(java.util.Locale.ROOT);
        }
    }
}
