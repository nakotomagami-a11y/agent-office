import { classifyResultError } from "@agent-office/domain/services/execution/runs/errors";

const MAX_LEN = 240;

/**
 * Some auth failures never reach the structured run-error path: the CLI streams the raw sentence
 * ("Failed to authenticate: OAuth session expired…") as the model's own reply, so it lands as a
 * plain agent-text bubble. Re-classify short finished text so the interactive card still appears,
 * under the provider the run actually used: a gateway 401 reads exactly like a subscription logout,
 * and for any other provider the Sign-in card would send the user to the wrong fix.
 */
export function misclassifiedAuthCode(text: string, streaming: boolean, provider: string): "auth_expired" | "subscription_disabled" | null {
  if (streaming) return null;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_LEN) return null;
  const { code } = classifyResultError(trimmed, trimmed, provider);
  return code === "auth_expired" || code === "subscription_disabled" ? code : null;
}
