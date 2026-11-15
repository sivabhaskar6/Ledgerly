"use client";
import { useState, useEffect } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/data/expenses";
import { settleBorrowRecord } from "@/lib/data/borrowing";
import { formatINR } from "@/lib/utils/money";
import { todayISO, displayDate } from "@/lib/utils/dates";
import type { BorrowRecordWithRefs } from "@/types/db";
import { CheckCircle2 } from "lucide-react";

export function SettleModal({
  open,
  record,
  onClose,
  onSettled,
  notify,
}: {
  open: boolean;
  record: BorrowRecordWithRefs | null;
  onClose: () => void;
  onSettled: () => void;
  notify: (type: "success" | "error", msg: string) => void;
}) {
  const [settledOn, setSettledOn] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSettledOn(todayISO());
      setError(null);
    }
  }, [open]);

  if (!record) return null;

  const isLent = record.type === "lent";

  async function handleConfirm() {
    if (!record) return;
    if (!settledOn) {
      setError("Please select the settlement date.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const db = createClient();
      await settleBorrowRecord(db, record.id, settledOn);
      notify(
        "success",
        `Marked as done: ${record.person_name} (${formatINR(record.amount_paise)}) settled on ${displayDate(settledOn)}.`
      );
      onSettled();
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Could not mark record as settled."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Mark as Settled / Done"
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-900 dark:text-white text-sm">{record.person_name}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase border ${
                isLent
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400"
              }`}
            >
              {isLent ? "You Lent / Gave" : "You Borrowed / Took"}
            </span>
          </div>
          <div className="mt-2.5 flex items-baseline justify-between border-t border-slate-200/60 pt-2 dark:border-white/10">
            <span className="text-slate-500 dark:text-zinc-400">
              {isLent ? "Amount received back:" : "Amount repaid:"}
            </span>
            <span className="num text-lg font-bold text-slate-900 dark:text-white">
              {formatINR(record.amount_paise)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-500">
            Originally recorded on {displayDate(record.occurred_on)}
          </p>
        </div>

        <div>
          <TextField
            label={
              isLent
                ? "Date you received the money back"
                : "Date you paid / returned the money"
            }
            type="date"
            value={settledOn}
            onChange={(e) => setSettledOn(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} loading={busy} className="bg-emerald-600 hover:bg-emerald-700">
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            Confirm & Mark as Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
