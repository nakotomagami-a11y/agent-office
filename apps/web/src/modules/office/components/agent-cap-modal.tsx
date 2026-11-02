"use client";

import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export type AgentCapModalProps =
  | {
      open: true;
      kind: "soft";
      onConfirm: () => void;
      onCancel: () => void;
    }
  | {
      open: true;
      kind: "hard";
      onDismiss: () => void;
    }
  | { open: false };

/**
 * Modal shown when the user tries to spawn an agent instance beyond the
 * project's soft cap (5) or hard cap (10). Replaces the previous
 * `window.confirm` / `window.alert` calls in `useSpawnInstance` — those
 * broke in Tauri's WebKit chrome and looked out of place next to the
 * rest of the app.
 *
 *  - soft cap → 2 CTAs: "Ignore & continue" (force through) + "Cancel"
 *  - hard cap → 1 CTA:  "OK" (no override)
 */
export function AgentCapModal(props: AgentCapModalProps) {
  if (!props.open) return null;

  if (props.kind === "hard") {
    return (
      <ModalShell
        open
        onClose={props.onDismiss}
        title="Roster is full"
        size="sm"
        footer={
          <Button variant="primary" className="min-w-[88px] justify-center" onClick={props.onDismiss}>
            OK
          </Button>
        }
      >
        <CapBody
          tintClass="text-status-error"
          heading="10 instances is the hard limit"
          body="Remove one from the roster before adding another."
        />
      </ModalShell>
    );
  }

  return (
    <ModalShell
      open
      onClose={props.onCancel}
      title="Add another instance?"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={props.onCancel}>Cancel</Button>
          <Button variant="primary" onClick={props.onConfirm}>Ignore & continue</Button>
        </>
      }
    >
      <CapBody tintClass="text-status-queued" heading="You already have several instances of this agent" />
    </ModalShell>
  );
}

function CapBody({ tintClass, heading, body }: { tintClass: string; heading: string; body?: string }) {
  return (
    <div className="flex gap-[14px] items-start">
      <div className={`flex items-center justify-center shrink-0 w-[52px] h-[52px] ${tintClass}`}>
        <Icon name="shield" size={46} className="w-[46px] h-[46px] [flex:0_0_46px]" />
      </div>
      <div className="flex-1 min-w-0">
        {body ? (
          <>
            <div className="font-semibold text-[13.5px] text-txt mb-[6px]">{heading}</div>
            <p className="m-0 text-[12.5px] text-txt-2 leading-[1.55]">{body}</p>
          </>
        ) : (
          <div className="font-semibold text-[13.5px] text-txt leading-[1.4] pt-1">{heading}</div>
        )}
      </div>
    </div>
  );
}
