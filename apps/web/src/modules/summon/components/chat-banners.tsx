"use client";

import { StreamBanner } from "./stream-banner";
import type { UseRunRecoveryResult } from "../hooks/use-run-recovery";
import type { useRunStream } from "../hooks/use-run-stream";

type StreamState = ReturnType<typeof useRunStream>;

export type ChatBannersProps = {
  activeRunId: string | null;
  recovered: UseRunRecoveryResult["recovered"];
  setRecovered: UseRunRecoveryResult["setRecovered"];
  resumeError: UseRunRecoveryResult["resumeError"];
  retryResume: UseRunRecoveryResult["retryResume"];
  dismissResume: UseRunRecoveryResult["dismissResume"];
  stream: StreamState;
  isStale: boolean;
  sinceLastEventMs: number | null;
  quotaWarning: string | null;
  setQuotaWarning: (v: string | null) => void;
  onContinueRecovered: () => void;
  onResummonLastMessage: () => void;
  lastUserMessageText: string | null;
};

/**
 * Renders exactly one diagnostic banner between the chat head and the
 * thread. Order (highest → lowest severity):
 * recovered > resume-missing > resume-transient > lost > retrying > stale
 * then a separate quota warning banner underneath.
 */
export function ChatBanners(props: ChatBannersProps): React.ReactElement | null {
  const primary = pickPrimaryBanner(props);
  const showQuota = !!props.quotaWarning;
  if (!primary && !showQuota) return null;
  return (
    <>
      {primary}
      {showQuota ? (
        <StreamBanner
          kind="warn"
          title="Budget notice"
          detail={props.quotaWarning ?? undefined}
          primary={{ label: "Dismiss", onClick: () => props.setQuotaWarning(null) }}
        />
      ) : null}
    </>
  );
}

function pickPrimaryBanner(props: ChatBannersProps): React.ReactElement | null {
  const { recovered, resumeError, stream, isStale, sinceLastEventMs, activeRunId, lastUserMessageText } = props;

  if (recovered) return renderRecoveredBanner(recovered, props.setRecovered, props.onContinueRecovered);
  if (resumeError?.kind === "missing") {
    return renderResumeMissingBanner(resumeError, activeRunId, lastUserMessageText, props.onResummonLastMessage, props.dismissResume);
  }
  if (resumeError?.kind === "transient") {
    return renderResumeTransientBanner(resumeError, activeRunId, props.retryResume, props.dismissResume);
  }
  if (stream.connection === "lost") return renderConnectionLostBanner(stream);
  if (stream.connection === "retrying") return renderConnectionRetryingBanner(stream);
  if (isStale && sinceLastEventMs !== null) return renderStaleStreamBanner(stream, sinceLastEventMs);
  return null;
}

function renderRecoveredBanner(
  recovered: NonNullable<UseRunRecoveryResult["recovered"]>,
  setRecovered: UseRunRecoveryResult["setRecovered"],
  onContinue: () => void,
): React.ReactElement {
  const cause = recovered.exitCode === -1
    ? "server was killed mid-run (no clean shutdown)"
    : `server restarted (exit ${recovered.exitCode})`;
  const detail = `Run ${recovered.runId} was interrupted - ${cause}. ${recovered.partialChars.toLocaleString()} chars · ${recovered.tokensOut.toLocaleString()} tok · $${recovered.cost.toFixed(3)} streamed before the kill - appended to the thread above. Click Continue to pick up where it stopped.`;
  return (
    <StreamBanner
      kind="warn"
      title="Recovered partial output from the previous run."
      detail={detail}
      primary={{ label: "Continue", onClick: onContinue }}
      secondary={{ label: "Dismiss", onClick: () => setRecovered(null) }}
    />
  );
}

function renderResumeMissingBanner(
  resumeError: Extract<UseRunRecoveryResult["resumeError"], { kind: "missing" }>,
  activeRunId: string | null,
  lastUserMessageText: string | null,
  onResummon: () => void,
  onDismiss: () => void,
): React.ReactElement {
  const helpTail = lastUserMessageText
    ? "Re-summon will re-send your last message as a fresh run; Drop run leaves the chat as-is."
    : "Drop run clears the dead reference. (No previous user message in the thread to re-send.)";
  const primary = lastUserMessageText
    ? { label: "Re-summon last message", onClick: onResummon }
    : { label: "Drop run", onClick: onDismiss };
  const secondary = lastUserMessageText ? { label: "Drop run", onClick: onDismiss } : undefined;
  return (
    <StreamBanner
      kind="warn"
      title="This run isn't on the server anymore."
      detail={`Run ${activeRunId} · ${resumeError.message}. Most likely the server restarted while it was in flight, so it never made it into runs.log. ${helpTail}`}
      primary={primary}
      secondary={secondary}
    />
  );
}

function renderResumeTransientBanner(
  resumeError: Extract<UseRunRecoveryResult["resumeError"], { kind: "transient" }>,
  activeRunId: string | null,
  onRetry: () => void,
  onDismiss: () => void,
): React.ReactElement {
  const title = resumeError.status
    ? `Server returned ${resumeError.status} when resuming this run.`
    : "Couldn't reach the server to resume this run.";
  return (
    <StreamBanner
      kind="error"
      title={title}
      detail={`Run ${activeRunId} · ${resumeError.message}`}
      primary={{ label: "Retry", onClick: onRetry }}
      secondary={{ label: "Drop run", onClick: onDismiss }}
    />
  );
}

function renderConnectionLostBanner(stream: StreamState): React.ReactElement {
  return (
    <StreamBanner
      kind="error"
      title="Stream connection lost."
      detail={stream.error ?? "The browser gave up on the EventSource. The run may still be in flight on the server."}
      primary={{ label: "Reconnect", onClick: stream.reconnect }}
    />
  );
}

function renderConnectionRetryingBanner(stream: StreamState): React.ReactElement {
  return (
    <StreamBanner
      kind="warn"
      title="Stream connection interrupted - reconnecting…"
      detail="Browser is retrying automatically. Click Reconnect if it doesn't recover."
      primary={{ label: "Reconnect now", onClick: stream.reconnect }}
    />
  );
}

function renderStaleStreamBanner(stream: StreamState, sinceLastEventMs: number): React.ReactElement {
  const detail = stream.lastEventAt
    ? `Last event at ${new Date(stream.lastEventAt).toLocaleTimeString()}. The agent may be thinking, or the stream may be silently stuck.`
    : "No events received yet.";
  return (
    <StreamBanner
      kind="warn"
      title={`No new output for ${Math.floor(sinceLastEventMs / 1000)}s - still waiting.`}
      detail={detail}
      primary={{ label: "Reconnect", onClick: stream.reconnect }}
    />
  );
}
