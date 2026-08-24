"use client";

import { useEffect, useRef, useState } from "react";
import { match } from "ts-pattern";
import { useTranslations } from "next-intl";
import { isRunErrorCode } from "@agent-office/domain/config/run-errors";
import { EXTERNAL_LINKS } from "@agent-office/domain/config/routes";
import type { RunErrorCode } from "@agent-office/domain/types";
import { agentDisplayName } from "@/lib/agent-display-name";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import type { OfficeAgent } from "@/modules/office/hooks/use-office-agents";
import type { ThreadItem } from "../format/thread-types";
import { Icon } from "@/components/ui/icon";
import { splitProse, type ProseItem } from "@/lib/markdown";
import {
  fmtDuration,
  extractImages,
  stripAttachmentFooter,
  highlightTS,
  inlineMd,
} from "../format/message-format";
import { ExpandedStateContext, useExpandedState } from "./expanded-state";
import { ToolGroupRow } from "./tool-group-row";
import { SubAgentCard } from "./sub-agent-card";
import { RateLimitCard } from "./rate-limit-card";
import { ScheduleResumeMenu } from "./schedule-resume-menu";
import { MsgActions } from "./msg-actions";
import { useSignInModalStore } from "@/lib/sign-in-modal-store";
import { useActiveProjectStore } from "@/lib/active-project-store";
import { useProject } from "@/modules/projects/hooks/use-projects";
import { useOfficeStore } from "@/modules/office/hooks/use-office-store";

// Re-export so `chat-thread` and any other consumer keeps its existing
// `from "./message-bubble"` imports working. Actual definitions live in
// their own files (see expanded-state.tsx, tool-group-row.tsx).
export { ExpandedStateContext, ToolGroupRow };

// ── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center cursor-zoom-out [animation:ao-lb-in_0.15s_ease]"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Attachment preview"
        className="max-w-[min(90vw,1400px)] max-h-[90vh] w-auto h-auto rounded-[10px] shadow-[0_24px_80px_rgba(0,0,0,0.6)] cursor-default"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        className="fixed top-[20px] right-[24px] w-[36px] h-[36px] rounded-full bg-white/[0.12] border border-white/[0.2] text-white text-[16px] cursor-pointer flex items-center justify-center transition-[background] duration-[120ms] hover:bg-white/[0.22]"
        onClick={onClose}
        aria-label="Close"
      >✕</button>
    </div>
  );
}

// ── Inline image thumbnail ────────────────────────────────────────────────────
function InlineImage({ src }: { src: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="block p-0 border border-ao-line-1 rounded-[8px] overflow-hidden cursor-zoom-in bg-ao-bg-3 transition-[border-color,box-shadow] duration-[120ms] shrink-0"
        onClick={() => setOpen(true)}
        aria-label="View image"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="Attachment" className="block max-w-[180px] max-h-[140px] w-auto h-auto object-cover" />
      </button>
      {open && <Lightbox src={src} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Image strip (row of thumbnails) ──────────────────────────────────────────
function ImageStrip({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {urls.map((url) => <InlineImage key={url} src={url} />)}
    </div>
  );
}

function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => undefined);
  }
}


// ── Code block ────────────────────────────────────────────────────────────────
function CodeBlock({ lang, body }: { lang: string; body: string }) {
  const lines = body.split("\n").length;
  return (
    <div className="ao-codeblock">
      <div className="flex items-center gap-[8px] px-[12px] py-[8px] bg-[var(--code-head-bg)] border-b border-[var(--code-head-border)] font-[var(--ao-font-mono)] text-[11px] text-[var(--ao-fg-2)] tracking-[0.04em]">
        <span className="text-[var(--ao-fg-1)]">{lang || "text"}</span>
        <span className="w-[3px] h-[3px] rounded-full bg-[var(--ao-fg-3)]" />
        <span>{lines} {lines === 1 ? "line" : "lines"}</span>
        <div className="ml-auto flex gap-[2px]">
          <button
            type="button"
            onClick={() => copyText(body)}
            className="inline-flex items-center gap-[5px] rounded-[5px] border-0 bg-transparent p-0 cursor-pointer font-[var(--ao-font-mono)] text-[11px] text-[var(--ao-fg-2)] hover:bg-[var(--code-head-bg)] hover:text-[var(--ao-fg-0)]"
          >
            <Icon name="code" size={12} /> copy
          </button>
        </div>
      </div>
      <pre dangerouslySetInnerHTML={{ __html: highlightTS(body) }} />
    </div>
  );
}

// ── Prose block ───────────────────────────────────────────────────────────────
function ProseBlock({ items, streaming }: { items: ProseItem[]; streaming?: boolean }) {
  const out: React.ReactNode[] = [];
  let paraBuf: string[] = [];
  let listBuf: string[] = [];

  const flushPara = (key: string) => {
    if (!paraBuf.length) return;
    out.push(<p key={key} dangerouslySetInnerHTML={{ __html: inlineMd(paraBuf.join(" ")) }} />);
    paraBuf = [];
  };
  const flushList = (key: string) => {
    if (!listBuf.length) return;
    out.push(
      <ul key={key}>
        {listBuf.map((it, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inlineMd(it) }} />
        ))}
      </ul>,
    );
    listBuf = [];
  };

  items.forEach((item, idx) => {
    const k = `n${idx}`;
    if (typeof item === "object" && item.type === "code") {
      flushPara(`p${k}`); flushList(`l${k}`);
      out.push(<CodeBlock key={k} lang={item.lang} body={item.body} />);
      return;
    }
    const ln = item as string;
    if (/^#{2,3}\s+/.test(ln)) {
      flushPara(`p${k}`); flushList(`l${k}`);
      out.push(<h3 key={k} dangerouslySetInnerHTML={{ __html: inlineMd(ln.replace(/^#{2,3}\s+/, "")) }} />);
      return;
    }
    if (/^[-*]\s+/.test(ln)) { flushPara(`p${k}`); listBuf.push(ln.replace(/^[-*]\s+/, "")); return; }
    if (/^\d+\.\s+/.test(ln)) { flushPara(`p${k}`); listBuf.push(ln.replace(/^\d+\.\s+/, "")); return; }
    if (ln.trim() === "") { flushPara(`p${k}`); flushList(`l${k}`); return; }
    flushList(`l${k}`);
    paraBuf.push(ln);
  });

  flushPara("pf"); flushList("lf");

  if (streaming) {
    out.push(<p key="tail"><span className="ao-cursor" aria-hidden /></p>);
  }
  return <>{out}</>;
}

// ── Single tool call detail panel ─────────────────────────────────────────────
// ── Thinking row ──────────────────────────────────────────────────────────────
function ThinkingRow({ id, text, agent, hideAvatar = false }: { id: string; text: string; agent: OfficeAgent; hideAvatar?: boolean }) {
  const [open, toggle] = useExpandedState(id);
  const tokenEst = Math.max(1, Math.round(text.split(/\s+/).length * 1.3));
  return (
    <div className="flex items-start gap-[12px] relative group/msg">
      {hideAvatar ? (
        <div className="w-[60px] shrink-0" aria-hidden />
      ) : (
        <AgentAvatar unit={agent.unitChoice} size={60} label={agent.name} className="shrink-0" />
      )}
      <div className="flex-1 min-w-0 w-full">
        <div className={`border border-dashed border-ao-line-1 rounded-[10px] bg-white/[0.015]${open ? " ao-open" : ""}`}>
          <div className="flex items-center gap-[10px] px-[14px] py-[9px] cursor-pointer text-ao-fg-2 text-[12.5px] italic" onClick={toggle}>
            <span className="text-ao-fg-3"><Icon name="sparkle" size={13} /></span>
            <span>Thinking…</span>
            <span className="ml-auto flex items-center gap-2 font-mono text-[11px] text-ao-fg-3 not-italic">
              <span>~{tokenEst} tokens</span>
              <Icon name="chevron" size={12} className="transition-transform duration-[180ms] text-ao-fg-3 [.ao-open_&]:rotate-90 [.ao-open_&]:text-[var(--ao-accent)]" />
            </span>
          </div>
          {open && <div className="border-t border-dashed border-ao-line-1 px-[14px] py-[10px] font-mono text-[12px] leading-[1.6] text-ao-fg-1 whitespace-pre-wrap">{text}</div>}
        </div>
      </div>
    </div>
  );
}

// ── Clarify input strip ───────────────────────────────────────────────────────
function ClarifyInput({ onReply }: { onReply: (text: string) => void }) {
  const [val, setVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const send = () => {
    const v = val.trim();
    if (!v) return;
    onReply(v);
  };

  return (
    <div className="border border-[rgba(230,179,90,0.30)] bg-[linear-gradient(90deg,rgba(230,179,90,0.10),rgba(230,179,90,0.02)_70%)] rounded-[10px] p-[14px_16px] flex flex-col gap-[12px] mt-3">
      <div className="flex items-center gap-2 text-[11px] text-[var(--ao-warn)] uppercase tracking-[0.1em] font-mono font-bold">
        <span className="w-[6px] h-[6px] rounded-full bg-[var(--ao-warn)] shadow-[0_0_6px_var(--ao-warn)] animate-[ao-pulse_1.5s_infinite]" aria-hidden />
        Needs your reply
        <span className="font-mono ml-auto normal-case tracking-normal">↵ send</span>
      </div>
      <div className="flex items-center gap-2 pl-[14px] py-2 pr-[10px] bg-[var(--ao-bg-1)] border border-ao-line-1 rounded-[8px] focus-within:border-[rgba(230,179,90,0.5)] focus-within:[box-shadow:0_0_0_3px_rgba(230,179,90,0.10)]">
        <Icon name="corner-down" size={13} className="text-[var(--ao-fg-3)] shrink-0" />
        <input
          ref={inputRef}
          className="flex-1 bg-transparent border-0 outline-none text-ao-fg-0 text-[13.5px]"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Type your reply…"
          autoFocus
        />
        <button
          type="button"
          className="inline-flex items-center gap-[6px] px-3 py-[6px] bg-[var(--ao-warn)] text-[#2a1d05] rounded-[6px] font-semibold text-[12.5px]"
          onClick={send}
        >
          <Icon name="send" size={11} /> Reply
        </button>
      </div>
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────
export type MessageBubbleProps = {
  item: ThreadItem;
  agent: OfficeAgent;
  /** When true, appends an inline reply strip (agent asked a question). */
  isQuestion?: boolean;
  /** Called when the user submits a reply from the inline clarify input. */
  onReply?: (text: string) => void;
  /** Called when the user reruns their own message. */
  onRerun?: (text: string) => void;
  /** Called when the user deletes their own message from the thread. */
  onDelete?: () => void;
  /** Called when the user clicks Retry on an error card. */
  onRetry?: () => void;
  /** Called when the user repairs a missing worktree on a cwd error card. */
  onRepair?: () => Promise<void> | void;
  /** Stop the active run from a rate-limit warning card. */
  onStopRun?: () => void;
  /** Dismiss the rate-limit warning card (Continue — run keeps going). */
  onDismissRateLimit?: () => void;
  /** Schedule an auto-resume when the limit resets (rate-limit card). */
  onScheduleRateLimit?: () => void;
  /** Schedule a resume from the error/interrupted card at a user-chosen time (ms). */
  onScheduleResumeAt?: (fireAtMs: number) => void;
  /** Known rate-limit reset time (ms), offered as the recommended menu option. */
  resumeResetsAtMs?: number | null;
  /** When true, hides the avatar (consecutive messages from the same sender). */
  hideAvatar?: boolean;
};

/**
 * Single code-driven error card. The server/client classify a run failure into
 * a `RunErrorCode`; this component maps the code to localized copy and the right
 * recovery affordance. `detail` (already capped) is shown as a small, clamped
 * mono line — it can never become a transcript dump.
 */
function ErrorCard({
  code: rawCode,
  detail,
  interrupted,
  onRetry,
  onRepair,
  onScheduleResumeAt,
  resumeResetsAtMs,
}: {
  code: RunErrorCode;
  detail?: string;
  interrupted?: boolean;
  onRetry?: () => void;
  onRepair?: () => Promise<void> | void;
  onScheduleResumeAt?: (fireAtMs: number) => void;
  resumeResetsAtMs?: number | null;
}) {
  const t = useTranslations("errors.run");
  // Never let an unknown/undefined code render `errors.run.undefined.*`.
  const code = isRunErrorCode(rawCode) ? rawCode : "unknown";
  const [repairing, setRepairing] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const showRepair = Boolean(onRepair) && code === "worktree_missing";

  const handleRepair = async () => {
    if (!onRepair || repairing) return;
    setRepairing(true);
    try {
      await onRepair();
    } finally {
      setRepairing(false);
    }
  };

  // "stopped" (and any interrupted run) is a neutral pause, not a red failure.
  if (code === "stopped" || interrupted) {
    return <InterruptedCard onRetry={onRetry} onScheduleResumeAt={onScheduleResumeAt} resumeResetsAtMs={resumeResetsAtMs} scheduled={scheduled} onScheduled={() => setScheduled(true)} />;
  }
  if (code === "auth_expired") return <AuthErrorCard detail={detail} onRetry={onRetry} />;
  if (code === "subscription_disabled") return <SubscriptionDisabledCard detail={detail} onRetry={onRetry} />;

  return (
    <div className="border border-[rgba(217,83,79,0.30)] border-l-[3px] border-l-[var(--ao-bad)] rounded-[8px] px-[14px] py-3 bg-[rgba(217,83,79,0.05)] flex items-start gap-[10px]">
      <div className="w-[22px] h-[22px] flex items-center justify-center rounded-[6px] bg-[var(--ao-bad-soft)] text-[var(--ao-bad)] shrink-0"><Icon name="x" size={13} /></div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ao-fg-0 text-[13.5px]">{t(`${code}.title`)}</div>
        <div className="text-ao-fg-1 text-[12.5px] mt-0.5 leading-[1.5]">{t(`${code}.body`)}</div>
        {detail && (
          <div className="text-ao-fg-3 text-[11px] mt-1 font-mono break-words line-clamp-3">{detail}</div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {showRepair && (
            <button
              onClick={handleRepair}
              disabled={repairing}
              className="text-[var(--ao-bad)] text-[12px] cursor-pointer inline-flex items-center gap-1 bg-transparent border-0 p-0 disabled:opacity-40 disabled:cursor-default"
            >
              <Icon name="wrench" size={11} /> {repairing ? "Repairing…" : "Repair worktree"}
            </button>
          )}
          <button
            onClick={onRetry}
            disabled={!onRetry || repairing}
            className="text-[var(--ao-bad)] text-[12px] cursor-pointer inline-flex items-center gap-1 bg-transparent border-0 p-0 disabled:opacity-40 disabled:cursor-default"
          >
            <Icon name="refresh" size={11} /> Retry
          </button>
          {onScheduleResumeAt && (
            <ScheduleResumeMenu
              resetsAtMs={resumeResetsAtMs}
              onSchedule={onScheduleResumeAt}
              scheduled={scheduled}
              onScheduled={() => setScheduled(true)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Neutral card for a user-initiated interruption (Stop button). A stopped run
 * is not a failure, so it gets a calm slate treatment instead of the red error
 * card — with Retry to re-run the last message and Schedule to resume later.
 */
function InterruptedCard({
  onRetry,
  onScheduleResumeAt,
  resumeResetsAtMs,
  scheduled,
  onScheduled,
}: {
  onRetry?: () => void;
  onScheduleResumeAt?: (fireAtMs: number) => void;
  resumeResetsAtMs?: number | null;
  scheduled: boolean;
  onScheduled: () => void;
}) {
  const t = useTranslations("errors.run");
  return (
    <div className="border border-ao-line-1 border-l-[3px] border-l-ao-fg-3 rounded-[8px] px-[14px] py-3 bg-ao-bg-2 flex items-start gap-[10px]">
      <div className="w-[22px] h-[22px] flex items-center justify-center rounded-[6px] bg-ao-bg-3 text-ao-fg-2 shrink-0"><Icon name="stop" size={12} /></div>
      <div className="flex-1">
        <div className="font-semibold text-ao-fg-0 text-[13.5px]">{t("interrupted.title")}</div>
        <div className="text-ao-fg-2 text-[12.5px] mt-0.5 leading-[1.5]">{t("interrupted.body")}</div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={onRetry}
            disabled={!onRetry}
            className="text-ao-accent text-[12px] cursor-pointer inline-flex items-center gap-1 bg-transparent border-0 p-0 disabled:opacity-40 disabled:cursor-default"
          >
            <Icon name="refresh" size={11} /> Retry
          </button>
          {onScheduleResumeAt && (
            <ScheduleResumeMenu
              resetsAtMs={resumeResetsAtMs}
              onSchedule={onScheduleResumeAt}
              scheduled={scheduled}
              onScheduled={onScheduled}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Auth-specific error card: instead of raw red text + a Retry that just fails
 * again, offer an in-app "Sign in" that re-authenticates the account this
 * project runs under, then retries the failed message automatically.
 */
function AuthErrorCard({ detail, onRetry }: { detail?: string; onRetry?: () => void }) {
  const t = useTranslations("errors.run");
  const activeProjectId = useActiveProjectStore((s) => s.id);
  const projectQ = useProject(activeProjectId);
  const accountId = projectQ.data?.meta.accountId ?? "default";
  const openSignIn = useSignInModalStore((s) => s.open);

  const handleSignIn = () => {
    // Opening Sign-in replaces (closes) this chat modal. Capture the current
    // selection so success can reopen the chat, where the user can Retry.
    const { selectedId, selectedInstanceId, select } = useOfficeStore.getState();
    openSignIn({
      accountId,
      onSuccess: () => {
        if (selectedId) {
          select(selectedId, { instanceId: selectedInstanceId, tab: "conversation" });
        }
      },
    });
  };

  return (
    <div className="border border-[rgba(234,179,8,0.30)] border-l-[3px] border-l-[#ca8a04] rounded-[8px] px-[14px] py-3 bg-[rgba(234,179,8,0.05)] flex items-start gap-[10px]">
      <div className="w-[22px] h-[22px] flex items-center justify-center rounded-[6px] bg-[rgba(234,179,8,0.12)] text-[#ca8a04] shrink-0">
        <Icon name="lock" size={13} />
      </div>
      <div className="flex-1">
        <div className="font-semibold text-ao-fg-0 text-[13.5px]">{t("auth_expired.title")}</div>
        <div className="text-ao-fg-1 text-[12.5px] mt-0.5 leading-[1.5]">{t("auth_expired.body")}</div>
        {detail && <div className="text-ao-fg-3 text-[11px] mt-1 font-mono break-words line-clamp-3">{detail}</div>}
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={handleSignIn}
            className="text-[#ca8a04] text-[12px] cursor-pointer inline-flex items-center gap-1 bg-transparent border-0 p-0"
          >
            <Icon name="external-link" size={11} /> Sign in
          </button>
          <button
            onClick={onRetry}
            disabled={!onRetry}
            className="text-ao-fg-2 text-[12px] cursor-pointer inline-flex items-center gap-1 bg-transparent border-0 p-0 disabled:opacity-40 disabled:cursor-default"
          >
            <Icon name="refresh" size={11} /> Retry
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The account is valid but Anthropic revoked its Claude Code access (org /
 * subscription level). Re-authenticating the same account won't help, so the
 * primary action is a direct link out to the Claude account where the user can
 * see what's going on; secondary is switching to an account that has access.
 */
function SubscriptionDisabledCard({ detail, onRetry }: { detail?: string; onRetry?: () => void }) {
  const t = useTranslations("errors.run");
  const activeProjectId = useActiveProjectStore((s) => s.id);
  const projectQ = useProject(activeProjectId);
  const accountId = projectQ.data?.meta.accountId ?? "default";
  const openSignIn = useSignInModalStore((s) => s.open);

  const handleSwitch = () => {
    const { selectedId, selectedInstanceId, select } = useOfficeStore.getState();
    openSignIn({
      accountId,
      onSuccess: () => {
        if (selectedId) {
          select(selectedId, { instanceId: selectedInstanceId, tab: "conversation" });
        }
      },
    });
  };

  return (
    <div className="border border-[rgba(217,83,79,0.30)] border-l-[3px] border-l-[var(--ao-bad)] rounded-[8px] px-[14px] py-3 bg-[rgba(217,83,79,0.05)] flex items-start gap-[10px]">
      <div className="w-[22px] h-[22px] flex items-center justify-center rounded-[6px] bg-[var(--ao-bad-soft)] text-[var(--ao-bad)] shrink-0">
        <Icon name="lock" size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ao-fg-0 text-[13.5px]">{t("subscription_disabled.title")}</div>
        <div className="text-ao-fg-1 text-[12.5px] mt-0.5 leading-[1.5]">{t("subscription_disabled.body")}</div>
        {detail && <div className="text-ao-fg-3 text-[11px] mt-1 font-mono break-words line-clamp-3">{detail}</div>}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <a
            href={EXTERNAL_LINKS.claudeUsage}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--ao-bad)] text-[12px] cursor-pointer inline-flex items-center gap-1 no-underline"
          >
            <Icon name="external-link" size={11} /> {t("subscription_disabled.check_account")}
          </a>
          <button
            onClick={handleSwitch}
            className="text-ao-fg-2 text-[12px] cursor-pointer inline-flex items-center gap-1 bg-transparent border-0 p-0"
          >
            <Icon name="lock" size={11} /> {t("subscription_disabled.switch_account")}
          </button>
          <button
            onClick={onRetry}
            disabled={!onRetry}
            className="text-ao-fg-2 text-[12px] cursor-pointer inline-flex items-center gap-1 bg-transparent border-0 p-0 disabled:opacity-40 disabled:cursor-default"
          >
            <Icon name="refresh" size={11} /> Retry
          </button>
        </div>
      </div>
    </div>
  );
}

export function MessageBubble({ item, agent, isQuestion, onReply, onRerun, onDelete, onRetry, onRepair, onStopRun, onDismissRateLimit, onScheduleRateLimit, onScheduleResumeAt, resumeResetsAtMs, hideAvatar }: MessageBubbleProps) {
  return match(item)
    .with({ kind: "you" }, (item) => {
      const youImgs = extractImages(item.text);
      const youText = stripAttachmentFooter(item.text);
      return (
        <div className="flex flex-row-reverse self-end max-w-[80%] gap-[12px] relative group/msg min-w-0">
          <UserAvatar size={60} className="shrink-0" />
          <div className="flex flex-col items-end min-w-0 flex-1">
            <div className="bg-ao-bg-3 border border-ao-line-1 rounded-[14px_14px_4px_14px] px-4 py-3 text-[14px] leading-[1.55] text-ao-fg-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] max-w-full">
              {youText}
              <ImageStrip urls={youImgs} />
            </div>
            <MsgActions text={item.text} onRerun={onRerun} onDelete={onDelete} />
          </div>
        </div>
      );
    })
    .with({ kind: "agent-text" }, (item) => {
      const proseItems = splitProse(item.text);
      const agentImgs = extractImages(item.text);
      const showClarify = isQuestion && !item.streaming && !!onReply;
      return (
        <div className="flex items-start gap-[12px] relative group/msg">
          {hideAvatar ? (
            <div className="w-[60px] shrink-0" aria-hidden />
          ) : (
            <AgentAvatar unit={agent.unitChoice} size={60} label={agent.name} className="shrink-0" />
          )}
          <div className="flex-1 min-w-0 pt-0.5">
            {!hideAvatar && (
              <div className="text-[12px] font-semibold text-ao-fg-1 flex items-center gap-2 mb-[6px]">
                <span>{agentDisplayName(agent)}</span>
                {item.streaming ? (
                  <span className="text-ao-fg-3 font-mono text-[11px] font-normal text-[var(--ao-accent)]">typing…</span>
                ) : null}
              </div>
            )}
            {hideAvatar && item.streaming && (
              <div className="text-[12px] font-semibold text-ao-fg-1 flex items-center gap-2 mb-[6px]">
                <span className="text-ao-fg-3 font-mono text-[11px] font-normal text-[var(--ao-accent)]">typing…</span>
              </div>
            )}
            <div className="ao-prose">
              <ProseBlock items={proseItems} streaming={item.streaming} />
            </div>
            <ImageStrip urls={agentImgs} />
            {showClarify ? (
              <ClarifyInput onReply={onReply} />
            ) : !item.streaming ? (
              <MsgActions text={item.text} />
            ) : null}
          </div>
        </div>
      );
    })
    .with({ kind: "agent-tool" }, (item) => (
      <ToolGroupRow
        id={item.id}
        tools={[{ id: item.id, name: item.name, arg: item.arg }]}
        agent={agent}
      />
    ))
    .with({ kind: "agent-subagent" }, (item) => <SubAgentCard item={item} />)
    .with({ kind: "agent-thinking" }, (item) => (
      <ThinkingRow id={item.id} text={item.text} agent={agent} hideAvatar={hideAvatar} />
    ))
    .with({ kind: "system-rate-limit" }, (item) => (
      <RateLimitCard message={item.message} resetsAt={item.resetsAt} severity={item.severity} onStop={onStopRun} onDismiss={onDismissRateLimit} onSchedule={onScheduleRateLimit} />
    ))
    .with({ kind: "system-error" }, (item) => (
      <ErrorCard code={item.code} detail={item.detail} interrupted={item.interrupted} onRetry={onRetry} onRepair={onRepair} onScheduleResumeAt={onScheduleResumeAt} resumeResetsAtMs={resumeResetsAtMs} />
    ))
    .with({ kind: "system-done" }, (item) => {
      const totalTok =
        item.tokensIn !== undefined || item.tokensOut !== undefined
          ? (item.tokensIn ?? 0) + (item.tokensOut ?? 0)
          : null;
      return (
        <div className="flex items-center gap-3 my-1">
          <span className="flex-1 h-[1px] bg-[var(--ao-line-0)]" />
          <span className="inline-flex items-center gap-[6px] px-3 py-[5px] bg-ao-bg-2 border border-ao-line-1 rounded-full font-mono text-[11px] text-ao-fg-2">
            <span className="text-[var(--ao-ok)] inline-flex items-center gap-1">
              <Icon name="check" size={11} />
              {item.exitCode === 0 ? "Done" : `Exited ${item.exitCode}`}
            </span>
            {item.durationMs !== undefined && (
              <>
                <span className="text-ao-fg-3 select-none" aria-hidden>·</span>
                <span>{fmtDuration(item.durationMs)}</span>
              </>
            )}
            {totalTok !== null && totalTok > 0 && (
              <>
                <span className="text-ao-fg-3 select-none" aria-hidden>·</span>
                <span>{totalTok.toLocaleString()} tok</span>
              </>
            )}
            {item.cost !== undefined && item.cost > 0 && (
              <>
                <span className="text-ao-fg-3 select-none" aria-hidden>·</span>
                <span>${item.cost.toFixed(4)}</span>
              </>
            )}
          </span>
          <span className="flex-1 h-[1px] bg-[var(--ao-line-0)]" />
        </div>
      );
    })
    .exhaustive();
}
