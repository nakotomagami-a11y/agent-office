"use client";

import { ModalShell } from "@/components/ui/modal-shell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

/**
 * Destructive confirm for wiping the build canvas — replaces the old native
 * `window.confirm`. Clears all decorations and placed agents and empties the
 * whole grid back to open ocean (every cell → water, not grass); the change
 * is still on the undo stack so it's a soft reset in practice, but the copy
 * stays cautious since it touches the whole map.
 */
export function ResetCanvasModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      onEnter={handleConfirm}
      title="Reset canvas"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm}>
            <Icon name="trash" size={13} />
            <span className="ml-[6px]">Reset canvas</span>
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-[10px] rounded-[8px] border border-[color-mix(in_srgb,var(--error)_35%,transparent)] bg-[color-mix(in_srgb,var(--error)_10%,transparent)] p-[10px]">
        <Icon name="shield" size={15} className="text-status-error shrink-0 mt-[1px]" />
        <p className="m-0 text-[12.5px] text-txt-2 leading-[1.5]">
          This clears all decorations and placed agents and empties the whole map back to open
          ocean. You can still undo it with <span className="font-mono">Ctrl+Z</span> right after.
        </p>
      </div>
    </ModalShell>
  );
}
