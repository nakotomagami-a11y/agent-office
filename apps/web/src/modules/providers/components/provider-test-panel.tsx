"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ProviderStatusReason } from "@agent-office/domain/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SignInPanel } from "@/modules/accounts/components/sign-in-panel";
import { useSignInModalStore } from "@/lib/sign-in-modal-store";
import { cn } from "@/lib/cn";
import { REASON_ACTION } from "../format/provider-format";
import type { ProviderSetup } from "../hooks/use-provider-setup";

/**
 * The wizard sits above the app's modal layer (z-9999 against the modal's 200), so a
 * sign-in modal would open behind it. There the panel is rendered in place.
 */
export type SignInMode = "inline" | "modal";

function CliRow({ setup }: { setup: ProviderSetup }) {
  const t = useTranslations("providers");
  const cli = setup.data?.cli;
  const state = !cli ? "checking" : cli.available ? "ok" : "missing";
  return (
    <div className="flex items-center gap-[12px] rounded-2xl border border-edge bg-card px-[14px] py-[10px]">
      <span
        className={cn(
          "flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[10px]",
          state === "ok" && "bg-green-soft text-green",
          state === "missing" && "bg-red-soft text-red",
          state === "checking" && "bg-card-2 text-txt-3",
        )}
      >
        <Icon name={state === "ok" ? "check" : state === "missing" ? "x" : "refresh"} size={14} className={state === "checking" ? "animate-spin" : undefined} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-bold">{t("cli_label")}</div>
        <div className="truncate font-mono text-[11px] text-txt-4">
          {state === "ok" ? t("cli_ok", { version: cli?.version ?? "" }) : state === "missing" ? t("cli_missing") : t("cli_checking")}
        </div>
      </div>
      <Button size="sm" onClick={() => void setup.runTest()} disabled={setup.busy || !setup.choice}>
        {t("recheck")}
      </Button>
    </div>
  );
}

function Verdict({ setup, onAction }: { setup: ProviderSetup; onAction: (reason: ProviderStatusReason) => void }) {
  const t = useTranslations("providers");
  const te = useTranslations("errors.provider");
  const { outcome, failure, view, phase } = setup;

  if (phase === "testing") {
    return (
      <p className="m-0 flex items-center gap-[8px] text-[12.5px] text-txt-2">
        <Icon name="refresh" size={13} className="animate-spin" />
        {t("testing")}
      </p>
    );
  }
  if (outcome?.ok) {
    const count = outcome.availableModels?.length;
    return (
      <p className="m-0 flex flex-wrap items-center gap-x-[8px] text-[12.5px] font-semibold text-green">
        <Icon name="check" size={13} />
        {t("test_ok", { ms: outcome.latencyMs })}
        {count ? <span className="font-normal text-txt-3">{t("test_models", { count })}</span> : null}
      </p>
    );
  }
  const reason = (outcome && !outcome.ok ? outcome.reason : undefined) ?? failure?.reason ?? view?.status.reason;
  const bad = Boolean(outcome && !outcome.ok) || Boolean(failure) || view?.status.available === false;
  if (!bad || !reason) {
    if (failure?.code) return <p role="alert" className="m-0 text-[12.5px] text-red">{t("generic_error")} <code className="font-mono">{failure.code}</code></p>;
    return <p className="m-0 text-[12.5px] text-txt-3">{view?.status.checkedAt ? t("checked_ok_before") : t("not_tested")}</p>;
  }
  const detail = (outcome && !outcome.ok ? outcome.detail : undefined) ?? view?.status.detail;
  const action = REASON_ACTION[reason];
  return (
    <div role="alert" className="flex flex-col gap-[6px] rounded-xl border border-[var(--error)] bg-[rgba(239,68,68,0.08)] px-[12px] py-[10px]">
      <p className="m-0 text-[12.5px] font-bold text-red">{t("unavailable", { reason: te(`${reason}.title`) })}</p>
      <p className="m-0 text-[12px] leading-[1.55] text-txt-2 text-pretty">{te(`${reason}.body`)}</p>
      {detail ? <code className="break-words font-mono text-[10.5px] text-txt-4">{detail}</code> : null}
      {action !== "edit" ? (
        <Button size="sm" className="self-start" onClick={() => onAction(reason)} disabled={setup.busy}>
          {t(action === "sign_in" ? "action_sign_in" : "action_recheck")}
        </Button>
      ) : null}
    </div>
  );
}

/** CLI readiness, the Test button, and the honest result. Re-testing is the only way a green result is earned. */
export function ProviderTestPanel({ setup, signIn }: { setup: ProviderSetup; signIn: SignInMode }) {
  const t = useTranslations("providers");
  const openSignIn = useSignInModalStore((s) => s.open);
  const [signingIn, setSigningIn] = useState(false);
  const onAction = (reason: ProviderStatusReason) => {
    if (REASON_ACTION[reason] === "recheck") void setup.runTest();
    else if (signIn === "inline") setSigningIn(true);
    else openSignIn({ accountId: "default", onSuccess: () => void setup.runTest() });
  };
  return (
    <div className="flex flex-col gap-[10px]">
      <CliRow setup={setup} />
      <div className="flex flex-wrap items-center gap-[10px]">
        <Button onClick={() => void setup.runTest()} disabled={setup.busy || !setup.choice}>
          {t(setup.phase === "testing" ? "testing" : "test")}
        </Button>
      </div>
      <div aria-live="polite" className="min-h-[20px]">
        <Verdict setup={setup} onAction={onAction} />
      </div>
      {signingIn ? (
        <SignInPanel
          accountId="default"
          onSuccess={() => {
            setSigningIn(false);
            void setup.runTest();
          }}
        />
      ) : null}
    </div>
  );
}
