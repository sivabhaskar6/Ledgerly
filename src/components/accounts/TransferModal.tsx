"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField, FieldShell } from "@/components/ui/Field";
import { FormError } from "@/components/layout/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { createTransfer } from "@/lib/data/accounts";
import { errorMessage } from "@/lib/data/expenses";
import { transferFormSchema, type TransferFormValues } from "@/lib/validations/account";
import { todayISO } from "@/lib/utils/dates";
import type { Account } from "@/types/db";

type Props = {
  open: boolean;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
  notify: (type: "success" | "error", msg: string) => void;
};

export function TransferModal({ open, accounts, onClose, onSaved, notify }: Props) {
  const [error, setError] = useState<string | null>(null);

  const activeAccounts = accounts.filter((a) => !a.archived_at);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: {
      from_account_id: activeAccounts[0]?.id || "",
      to_account_id: activeAccounts[1]?.id || "",
      amount: "",
      occurred_on: todayISO(),
      note: "",
    },
  });

  useEffect(() => {
    if (open) {
      setError(null);
      const actives = accounts.filter((a) => !a.archived_at);
      reset({
        from_account_id: actives[0]?.id || "",
        to_account_id: actives[1]?.id || "",
        amount: "",
        occurred_on: todayISO(),
        note: "",
      });
    }
  }, [open, accounts, reset]);

  async function onSubmit(v: TransferFormValues) {
    setError(null);
    try {
      const db = createClient();
      await createTransfer(db, v);
      notify("success", "Transfer recorded.");
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Could not record the transfer."));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Transfer between accounts">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError message={error} />
        <p className="text-xs text-slate-500">
          Transfers move money between your accounts without affecting your expenses or income.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="From account" {...register("from_account_id")} error={errors.from_account_id?.message}>
            <option value="">Select source</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
            ))}
          </SelectField>
          <SelectField label="To account" {...register("to_account_id")} error={errors.to_account_id?.message}>
            <option value="">Select destination</option>
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
            ))}
          </SelectField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell label="Amount (₹)" error={errors.amount?.message}>
            {(id, d) => (
              <input
                id={id}
                inputMode="decimal"
                placeholder="0.00"
                aria-describedby={d}
                {...register("amount")}
                className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm ${errors.amount ? "border-red-400" : "border-slate-300"}`}
              />
            )}
          </FieldShell>
          <TextField label="Transfer date" type="date" {...register("occurred_on")} error={errors.occurred_on?.message} />
        </div>
        <TextField label="Note (optional)" placeholder="e.g. ATM cash withdrawal, Demat fund add" {...register("note")} error={errors.note?.message} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>Record transfer</Button>
        </div>
      </form>
    </Dialog>
  );
}
