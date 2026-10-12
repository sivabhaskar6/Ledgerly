"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField, FieldShell } from "@/components/ui/Field";
import { FormError } from "@/components/layout/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { createAccount, updateAccount } from "@/lib/data/accounts";
import { errorMessage } from "@/lib/data/expenses";
import { accountFormSchema, ACCOUNT_TYPES, type AccountFormValues } from "@/lib/validations/account";
import { paiseToRupeesString } from "@/lib/utils/money";
import { todayISO } from "@/lib/utils/dates";
import type { Account } from "@/types/db";

type Props = {
  open: boolean;
  account: Account | null;
  onClose: () => void;
  onSaved: () => void;
  notify: (type: "success" | "error", msg: string) => void;
};

export function AccountFormModal({ open, account, onClose, onSaved, notify }: Props) {
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: "",
      type: "bank",
      opening_balance: "0",
      opening_date: todayISO(),
    },
  });

  useEffect(() => {
    if (open) {
      setError(null);
      if (account) {
        reset({
          name: account.name,
          type: account.type,
          opening_balance: paiseToRupeesString(account.opening_balance_paise),
          opening_date: account.opening_date || "",
        });
      } else {
        reset({
          name: "",
          type: "bank",
          opening_balance: "0",
          opening_date: todayISO(),
        });
      }
    }
  }, [open, account, reset]);

  async function onSubmit(v: AccountFormValues) {
    setError(null);
    try {
      const db = createClient();
      if (account) {
        await updateAccount(db, account.id, v);
        notify("success", "Account updated.");
      } else {
        await createAccount(db, v);
        notify("success", "Account created.");
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Could not save the account."));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={account ? "Edit account" : "Add account"}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError message={error} />
        <TextField label="Account name" placeholder="e.g. HDFC Salary, Wallet, Zerodha" {...register("name")} error={errors.name?.message} autoFocus />
        <SelectField label="Account type" {...register("type")} error={errors.type?.message}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell label="Opening balance (₹)" error={errors.opening_balance?.message}>
            {(id, d) => (
              <input
                id={id}
                inputMode="decimal"
                placeholder="0.00"
                aria-describedby={d}
                {...register("opening_balance")}
                className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm ${errors.opening_balance ? "border-red-400" : "border-slate-300"}`}
              />
            )}
          </FieldShell>
          <TextField label="Opening date (optional)" type="date" {...register("opening_date")} error={errors.opening_date?.message} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{account ? "Save changes" : "Create account"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
