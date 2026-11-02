"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api/query-keys";
import { Button, ACCENT_BTN_FADED_DISABLED } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { cn } from "@/lib/cn";
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
  /** Modals render SignInStatus in their footer instead. */
  showStatus?: boolean;
}

/**
 * Drives an in-app `claude auth login`: starts the CLI on mount, opens the
 * OAuth page for the user, accepts a pasted authorization code, and reports
 * success — no terminal required. Rendered inside ModalShell by SignInModal
 * and inline by the add-account flow.
 */
export function SignInPanel({ accountId, onSuccess, showStatus = true }: SignInPanelProps) {
  const qc = useQueryClient();
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

  // On success: refresh every cached view of this account (the Settings
  // health pill / "needs login" tag included — it reads the same
  // `useAccounts()` list, which would otherwise stay stale until something
  // else happens to refetch it) and notify the parent.
  useEffect(() => {
    if (state.phase !== "success") return;
    qc.invalidateQueries({ queryKey: queryKeys.accounts.list() });
    qc.invalidateQueries({ queryKey: queryKeys.accounts.status(accountId) });
    onSuccess();
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
    <div className="flex flex-col gap-[18px] -mt-[2px] mb-[2px]">
      <SignInStep n={1} title="Approve in your browser" action={
        <button
          type="button"
          onClick={() => state.url && openExternalUrl(state.url)}
          disabled={!state.url}
          className="inline-flex items-center gap-[5px] bg-transparent border-0 p-0 text-[12px] font-semibold text-acc cursor-pointer transition-colors hover:text-txt disabled:text-txt-4 disabled:cursor-default"
        >
          <Icon name="external-link" size={12} className="w-[12px] h-[12px] [flex:0_0_12px]" />
          {state.url ? "Open again" : "Preparing…"}
        </button>
      } />

      <SignInStep n={2} title="Paste the code">
        <div className="relative flex items-center">
          <TextInput
            variant="soft"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste authorization code"
            spellCheck={false}
            disabled={!state.url}
            className="h-[46px] pl-4 pr-[92px] font-mono text-[12.5px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSubmitCode();
              }
            }}
          />
          <Button
            variant="primary"
            onClick={handleSubmitCode}
            disabled={!state.url || !code.trim() || submit.isPending}
            className={cn("absolute right-[7px] min-w-[76px] px-3 justify-center rounded-[9px] text-[12.5px] font-semibold text-white shadow-none hover:shadow-none hover:translate-y-0", ACCENT_BTN_FADED_DISABLED)}
          >
            {submit.isPending ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </SignInStep>

      {state.message ? (
        <div className="text-[12px] text-[var(--error)]">{state.message}</div>
      ) : null}
      {showStatus && <SignInStatus accountId={accountId} />}
    </div>
  );
}

/** One numbered step of a sign-in flow (also used by the GitHub add-account flow). */
export function SignInStep({ n, title, action, gap = 10, children }: { n: number; title: string; action?: React.ReactNode; gap?: 8 | 10; children?: React.ReactNode }) {
  return (
    <div className="flex gap-[12px]">
      <span className="w-[22px] h-[22px] shrink-0 rounded-full flex items-center justify-center bg-acc-soft text-acc font-mono text-[11px] font-bold">
        {n}
      </span>
      <div className={cn("flex-1 min-w-0 flex flex-col pt-[2px]", gap === 8 ? "gap-[8px]" : "gap-[10px]")}>
        <div className="flex items-center gap-[8px]">
          <span className="text-[13px] font-semibold">{title}</span>
          <span className="flex-1" />
          {action}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Footer status for a modal hosting SignInPanel: reads the panel's polled login state from the query cache. */
export function SignInStatus({ accountId }: { accountId: string }) {
  const { data } = useLoginState(accountId, false);
  if (data?.phase === "error") {
    return <span className="mr-auto text-[12px] text-status-error">Sign-in failed. Close and try again.</span>;
  }
  return (
    <span className="mr-auto flex items-center gap-[8px] text-[12px] text-txt-3">
      <span className="w-[10px] h-[10px] rounded-full border-2 border-acc border-t-transparent animate-[spin_0.9s_linear_infinite]" />
      Waiting for sign-in…
    </span>
  );
}
