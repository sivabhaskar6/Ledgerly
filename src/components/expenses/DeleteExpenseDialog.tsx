"use client";
import { useState } from "react";
import type { ExpenseWithRefs } from "@/types/db";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient } from "@/lib/supabase/client";
import { errorMessage, softDeleteExpense } from "@/lib/data/expenses";
import { useToast } from "@/components/ui/Toast";

export function DeleteExpenseDialog({ expense, onClose, onDeleted }: { expense: ExpenseWithRefs | null; onClose: () => void; onDeleted: () => void }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (!expense) return;
    setBusy(true);
    try {
      await softDeleteExpense(createClient(), expense.id);
      notify("success", "Moved to Recently deleted. You can restore it from there.");
      onDeleted();
      onClose();
    } catch (e) { notify("error", errorMessage(e, "Could not delete the expense.")); } finally { setBusy(false); }
  }
  return (
    <ConfirmDialog open={!!expense} title="Delete this expense?" busy={busy} confirmLabel="Move to Recently deleted"
      body={expense ? `"${expense.title}" will be removed from your totals and charts. You can restore it from Recently deleted.` : ""}
      onConfirm={confirm} onClose={onClose} />
  );
}
