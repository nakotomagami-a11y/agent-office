// Re-exported from the domain package so both the server (run classification)
// and the client (thread rendering) share one reset-time parser.
export { parseResetTimeFromMessage } from "@agent-office/domain/services/execution/runs/reset-time";
