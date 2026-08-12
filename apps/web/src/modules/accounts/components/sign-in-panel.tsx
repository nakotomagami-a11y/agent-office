"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { Icon } from "@/components/ui/icon";
import { openExternalUrl } from "@/lib/tauri-window";
import {
  useStartLogin,
  useSubmitLoginCode,
  useLoginState,
  type LoginState,
} from "../hooks/use-account-login";

interface SignInPanelProps {
  accountId: string;
  /** Fired once the CLI writes credentials (phase === "success"). */
  onSuccess: () => void;
}

/**
 * Drives an in-app `claude auth login`: starts the CLI on mount, opens the
 * OAuth page for the user, accepts a pasted authorization code, and reports
 * success — no terminal required. Rendered inside ModalShell by SignInModal
 * and inline by the add-account flow.
 */
export function SignInPanel({ accountId, onSuccess }: SignInPanelProps) {
  const start = useStartLogin();
  const submit = useSubmitLoginCode();
  const [started, setStarted] = useState(false);
  const [code, setCode] = useState("");
  const openedUrlRef = useRef<string | null>(null);

  const poll = useLoginState(accountId, started);
  const state: LoginState =
    poll.data ?? start.data ?? { phase: "starting" };

  // Kick off the login exactly once when the panel mounts.
  useEffect(() => {
    start.mutate(accountId, { onSettled: () => setStarted(true) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per account
  }, [accountId]);

  // Auto-open the sign-in page in the browser the moment the URL is known.
  useEffect(() => {
    if (state.url && openedUrlRef.current !== state.url) {
      openedUrlRef.current = state.url;
      openExternalUrl(state.url);
    }
  }, [state.url]);

  // Notify parent on success.
  useEffect(() => {
    if (state.phase === "success") onSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  const handleSubmitCode = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    submit.mutate({ id: accountId, code: trimmed });
    setCode("");
  };

  if (state.phase === "success") {
    return (
      <div className="flex items-center gap-[10px]">
        <Icon name="check" size={16} className="text-status-done" />
        <span className="text-[13px] text-txt">Signed in — you&apos;re all set.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[12px]">
      <p className="m-0 text-[13px] text-txt-2 leading-[1.55]">
        A Claude sign-in page should have opened in your browser. Approve the
        login there, then paste the code it gives you below. (If nothing opened,
        use the button.)
      </p>

      <div className="flex items-center gap-[8px]">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => state.url && openExternalUrl(state.url)}
          disabled={!state.url}
        >
          <Icon name="external-link" size={14} />
          <span className="ml-[6px]">
            {state.url ? "Open sign-in page" : "Preparing…"}
          </span>
        </Button>
        {!state.url ? (
          <div className="w-[14px] h-[14px] rounded-full border-2 border-acc border-t-transparent animate-spin" />
        ) : null}
      </div>

      <div className="flex items-stretch gap-[6px]">
        <TextInput
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste authorization code"
          disabled={!state.url}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSubmitCode();
            }
          }}
        />
        <Button
          size="sm"
          variant="primary"
          onClick={handleSubmitCode}
          disabled={!state.url || !code.trim() || submit.isPending}
        >
          {submit.isPending ? "Submitting…" : "Submit"}
        </Button>
      </div>

      {state.message ? (
        <div className="text-[12px] text-[var(--error)]">{state.message}</div>
      ) : null}

      {state.phase === "error" ? (
        <div className="text-[12px] text-[var(--error)]">
          Sign-in failed. Close and try again.
        </div>
      ) : (
        <div className="flex items-center gap-[8px] text-[12px] text-txt-3">
          <div className="w-[10px] h-[10px] rounded-full border-2 border-acc border-t-transparent animate-spin" />
          <span>Waiting for sign-in to complete…</span>
        </div>
      )}
    </div>
  );
}
