"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { expenseFormSchema, PAYMENT_METHODS, type ExpenseFormValues } from "@/lib/validations/expense";
import { createClient } from "@/lib/supabase/client";
import { createExpense, errorMessage, updateExpense } from "@/lib/data/expenses";
import { paiseToRupeesString } from "@/lib/utils/money";
import { todayISO } from "@/lib/utils/dates";
import type { Account, Category, ExpenseWithRefs } from "@/types/db";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField, FieldShell } from "@/components/ui/Field";
import { FormError } from "@/components/layout/AuthShell";
import { useToast } from "@/components/ui/Toast";

function defaults(e: ExpenseWithRefs | null): ExpenseFormValues {
  return e
    ? { category_id: e.category_id, title: e.title, occurred_on: e.occurred_on, note: e.note ?? "", amount: paiseToRupeesString(e.amount_paise), account_id: e.account_id ?? "", payment_method: (e.payment_method as ExpenseFormValues["payment_method"]) ?? "" }
    : { category_id: "", title: "", occurred_on: todayISO(), note: "", amount: "", account_id: "", payment_method: "" };
}

export function ExpenseForm({ open, expense, categories, accounts, onClose, onSaved }: {
  open: boolean; expense: ExpenseWithRefs | null; categories: Category[]; accounts: Account[]; onClose: () => void; onSaved: () => void;
}) {
  const { notify } = useToast();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema), defaultValues: defaults(expense),
  });
  useEffect(() => { if (open) { reset(defaults(expense)); setError(null); } }, [open, expense, reset]);

  async function onSubmit(v: ExpenseFormValues) {
    setError(null);
    try {
      const db = createClient();
      if (expense) await updateExpense(db, expense.id, v); else await createExpense(db, v);
      notify("success", expense ? "Expense updated." : "Expense added.");   // only after the database confirms
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Could not save the expense."));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={expense ? "Edit expense" : "Add expense"} wide>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError message={error} />
        <TextField label="Expense title" {...register("title")} error={errors.title?.message} autoFocus />
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell label="Amount (₹)" error={errors.amount?.message}>
            {(id, d) => <input id={id} inputMode="decimal" placeholder="0.00" aria-invalid={!!errors.amount} aria-describedby={d}
              {...register("amount")} className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm ${errors.amount ? "border-red-400" : "border-slate-300"}`} />}
          </FieldShell>
          <TextField label="Date" type="date" {...register("occurred_on")} error={errors.occurred_on?.message} />
        </div>
        <SelectField label="Category" {...register("category_id")} error={errors.category_id?.message}>
          <option value="">Choose a category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Payment account (optional)" {...register("account_id")} error={errors.account_id?.message}>
            <option value="">No account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectField>
          <SelectField label="Payment method (optional)" {...register("payment_method")} error={errors.payment_method?.message}>
            <option value="">Not specified</option>
            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </SelectField>
        </div>
        <TextField label="Note (optional)" {...register("note")} error={errors.note?.message} />
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{expense ? "Save changes" : "Add expense"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
