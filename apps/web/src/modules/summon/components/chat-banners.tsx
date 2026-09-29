"use client";

import { StreamBanner } from "./stream-banner";
import type { useRunStream } from "../hooks/use-run-stream";

type StreamState = ReturnType<typeof useRunStream>;

export type ChatBannersProps = {
  stream: StreamState;
  quotaWarning: string | null;
  setQuotaWarning: (v: string | null) => void;
};

/**
 * Renders exactly one diagnostic banner between the chat head and the
 * thread (stream connection lost > retrying), then a separate quota warning
 * banner underneath.
 *
 * The "quiet for Ns — still connected" stale banner is GONE. Its own comment
 * conceded a quiet stream "is almost always the agent thinking or running a
 * long tool, not a fault" — so it fired on every long task and told the user
 * nothing they could act on. A banner that is usually wrong trains people to
 * ignore all banners. Genuine faults (connection lost / retrying) still show.
 *
 * The old "recovered partial output" / "run isn't on the server anymore"
 * banners are GONE, not just hidden: they existed to patch over the
 * client-side splice/ref-index bugs from the pre-refactor architecture (a
 * stale `runStartIndexRef`, a dead `activeRunId` the client had no way to
 * verify). The server-authoritative conversation service self-heals that
 * exact class of staleness on every read/action (see
 * `reconcileIfStale` in execution/conversation.ts) — there is no longer a
 * state for these banners to report. See docs/chat-refactor.md.
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
  const { stream } = props;
  if (stream.connection === "lost") return renderConnectionLostBanner(stream);
  if (stream.connection === "retrying") return renderConnectionRetryingBanner(stream);
  return null;
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
