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

    /** REVIEW_ERROR_CODES (packages/domain/src/config/review.ts) the mod words itself; others show their code. */
    public static final class ReviewError {
        public static final String GH_MISSING = "gh_missing";
        public static final String GH_UNAUTHENTICATED = "gh_unauthenticated";
        public static final String NOT_GITHUB_REPO = "not_github_repo";
        public static final String GITHUB_ACCOUNT_MISSING = "github_account_missing";
        public static final String PR_NOT_FOUND = "pr_not_found";
        public static final String GH_FAILED = "gh_failed";

        private ReviewError() {}
    }

    /** PR_LINK_SOURCES (packages/domain/src/config/review.ts): how an agent's pull request was found. */
    public static final class PrLink {
        public static final String RECORDED = "recorded";
        public static final String BRANCH = "branch";

        private PrLink() {}
    }

    /** Error codes any route can answer: notFound's default (apps/server/src/lib/api-helpers.ts) and the roster cap. */
    public static final class ApiError {
        public static final String NOT_FOUND = "not_found";
        public static final String INSTANCE_CAP_EXCEEDED = "INSTANCE_CAP_EXCEEDED";

        private ApiError() {}
    }

    /** SESSION_REMOVAL_CODES (packages/domain/src/config/sessions.ts): why removing a seat was refused. */
    public static final class SessionRemoval {
        public static final String RUNNING = "session_running";
        public static final String HAS_WORK = "session_has_work";
        public static final String REMOVE_FAILED = "worktree_remove_failed";

        private SessionRemoval() {}
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
