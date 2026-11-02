"use client";

import { useEffect, useState, type ReactNode } from "react";
import { TextInput } from "@/components/ui/text-input";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { useTestSecretDraft, type SecretWithStatus } from "../hooks/use-secrets";
import { DAY, EXPIRY_OPTIONS, expiryMs, formatWarnDate, type Expiry } from "./secret-expiry";

export const FIELD_LABEL = "text-[12px] font-semibold text-txt-2";

// Textareas, not inputs: <input> strips newlines, which would corrupt PEM keys and multi-line commands.
export const SOFT_AREA =
  "py-[12px] px-[14px] bg-transparent border-0 rounded-none shadow-none resize-none [field-sizing:content] max-h-[140px] whitespace-pre overflow-x-hidden [scrollbar-width:none] focus:border-0";

// The field look lives on the wrapper: a textarea scrolled to its end ignores padding-right, so text ran under the button.
export const SOFT_FIELD = "relative flex transition-shadow duration-[140ms] focus-within:shadow-[0_0_0_2px_var(--acc-line)]";

/** The collapsible "Expiry & health check" part of the secret form. */
export function SecretHealthPanel({
  secret,
  name,
  expiry,
  onExpiry,
  expiresAt,
  onExpiresAt,
  testCmd,
  onTestCmd,
  verify,
  onVerify,
  value,
}: {
  secret?: SecretWithStatus | null;
  name: string;
  expiry: Expiry;
  onExpiry: (e: Expiry) => void;
  expiresAt: string;
  onExpiresAt: (date: string) => void;
  testCmd: string;
  onTestCmd: (cmd: string) => void;
  verify: boolean;
  onVerify: (on: boolean) => void;
  value: string;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(() => !!(secret?.expiresAt || secret?.testCmd || secret?.verifyBeforeRun));
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const test = useTestSecretDraft();
  useEffect(() => setTestMsg(null), [value, name]);

  const expires = expiryMs(expiry, expiresAt);
  const expiryNote =
    expiry === "never" ? "No warning badge"
    : expires === null ? "Choose a date · never blocks a run"
    : `Warns from ${formatWarnDate(expires - 7 * DAY)} · never blocks a run`;
  const canTest = !!name.trim() && !!testCmd.trim() && (!!value.trim() || !!secret) && !test.isPending;

  const handleTest = async () => {
    if (!canTest) return;
    setTestMsg("Testing…");
    try {
      const r = await test.mutateAsync({ name: name.trim(), value: value.trim() || undefined, testCmd: testCmd.trim(), id: secret?.id });
      setTestMsg(r.ok ? "✓ Valid" : `✗ Failed: ${r.output.trim().slice(0, 160)}`);
    } catch (e) {
      setTestMsg(`✗ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="flex flex-col rounded-[12px] bg-[color-mix(in_srgb,var(--txt)_2.5%,transparent)]">
      <button
        type="button"
        onClick={() => setAdvancedOpen((o) => !o)}
        aria-expanded={advancedOpen}
        className="flex items-center gap-[8px] px-[14px] py-[12px] border-0 bg-transparent text-left text-txt cursor-pointer select-none [font:inherit] rounded-[12px] focus-visible:outline-2 focus-visible:outline-acc"
      >
        <span className="text-[12.5px] font-semibold">Expiry &amp; health check</span>
        <span className="text-[11.5px] text-txt-4">optional</span>
        <span className="flex-1" />
        <span className={cn("flex text-txt-4 transition-transform duration-200", advancedOpen && "rotate-180")}>
          <Icon name="chevron-down" size={14} className="w-[14px] h-[14px] [flex:0_0_14px]" />
        </span>
      </button>

      {advancedOpen && (
        <div className="flex flex-col gap-[16px] px-[14px] pt-[2px] pb-[14px]">
          <Section label="Expires">
            <div role="radiogroup" aria-label="Expires" className="flex gap-[4px] p-[3px] rounded-[11px] bg-card">
              {EXPIRY_OPTIONS.map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={expiry === key}
                  onClick={() => onExpiry(key)}
                  className={cn(
                    "flex-1 h-[30px] inline-flex items-center justify-center rounded-[8px] border-0 [font:inherit] text-[12px] font-semibold cursor-pointer transition-all duration-[140ms] hover:text-txt",
                    expiry === key ? "bg-card-3 text-txt shadow-[var(--inset-hi)]" : "bg-transparent text-txt-4",
                  )}
                >
                  {text}
                </button>
              ))}
            </div>
            {expiry === "date" && (
              <TextInput
                variant="soft"
                type="date"
                aria-label="Expiry date"
                value={expiresAt}
                onChange={(e) => onExpiresAt(e.target.value)}
                className="h-[42px] px-3 rounded-[11px] bg-card font-mono text-[12px]"
              />
            )}
            <span className="px-[2px] text-[11.5px] text-txt-4">{expiryNote}</span>
          </Section>

          <Section label="Test command">
            <span className={cn(SOFT_FIELD, "pr-[76px] bg-card rounded-[11px]")}>
              <Textarea
                wrap="off"
                rows={1}
                value={testCmd}
                onChange={(e) => {
                  onTestCmd(e.target.value);
                  setTestMsg(null);
                }}
                placeholder={`curl -sf -H "Authorization: Bearer $${name || "TOKEN"}" https://…`}
                spellCheck={false}
                aria-label="Test command"
                className={cn(SOFT_AREA, "min-h-[42px] pl-3 pr-0 [font:400_12px/1.5_var(--font-mono)]")}
              />
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={!canTest}
                title={canTest ? undefined : !name.trim() ? "Set the env var first" : !testCmd.trim() ? "Type a test command first" : !value.trim() && !secret ? "Paste the value first" : undefined}
                className="absolute right-[5px] top-[5px] h-8 px-3 inline-flex items-center gap-[6px] rounded-[8px] border-0 bg-card-3 [font:inherit] text-[12px] font-semibold text-txt-2 cursor-pointer transition-colors hover:text-txt disabled:cursor-default disabled:hover:text-txt-2 disabled:opacity-45"
              >
                <Icon name="play" size={11} className="w-[11px] h-[11px] [flex:0_0_11px]" />
                Test
              </button>
            </span>
            {testMsg ? <span className="px-[2px] text-[11.5px] text-txt-3 break-words">{testMsg}</span> : null}
          </Section>

          <button
            type="button"
            role="switch"
            aria-checked={verify}
            onClick={() => onVerify(!verify)}
            className="flex items-center gap-[12px] p-0 border-0 bg-transparent text-left text-txt [font:inherit] cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-acc"
          >
            <span className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-[12.5px] font-semibold">Verify before every run</span>
              <span className="text-[11.5px] text-txt-4">A failed test blocks the run</span>
            </span>
            <span className={cn("w-[34px] h-[20px] shrink-0 rounded-full p-[2px] flex transition-colors duration-[180ms]", verify ? "bg-acc" : "bg-card-3")}>
              <span
                className={cn(
                  "w-4 h-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.4)] transition-transform duration-200 ease-[cubic-bezier(.2,.8,.2,1)]",
                  verify && "translate-x-[14px]",
                )}
              />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[8px]">
      <span className={FIELD_LABEL}>{label}</span>
      {children}
    </div>
  );
}
