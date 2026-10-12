"use client";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

export function ConfirmDialog({ open, title, body, confirmLabel, busy, tone = "danger", onConfirm, onClose }: {
  open: boolean; title: string; body: string; confirmLabel: string; busy?: boolean; tone?: "danger" | "primary"; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-sm text-slate-600">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant={tone} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
