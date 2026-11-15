"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { TextField, FieldShell, SelectField } from "@/components/ui/Field";
import { FormError } from "@/components/layout/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/data/expenses";
import { createBorrowRecord, updateBorrowRecord } from "@/lib/data/borrowing";
import { borrowFormSchema, type BorrowFormValues } from "@/lib/validations/borrowing";
import { paiseToRupeesString } from "@/lib/utils/money";
import { todayISO } from "@/lib/utils/dates";
import type { Account, BorrowRecordWithRefs } from "@/types/db";
import { ArrowUpRight, ArrowDownLeft, CheckCircle2, Clock } from "lucide-react";

const blankValues = (): BorrowFormValues => ({
  person_name: "",
  type: "lent",
  amount: "",
  occurred_on: todayISO(),
  due_date: "",
  status: "pending",
  settled_on: "",
  account_id: "",
  note: "",
});

export function BorrowFormModal({
  open,
  record,
  accounts,
  onClose,
  onSaved,
  notify,
}: {
  open: boolean;
  record: BorrowRecordWithRefs | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
  notify: (type: "success" | "error", msg: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<BorrowFormValues>({
    resolver: zodResolver(borrowFormSchema),
    defaultValues: blankValues(),
  });

  const selectedType = watch("type");
  const selectedStatus = watch("status");

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (record) {
      reset({
        person_name: record.person_name,
        type: record.type,
        amount: paiseToRupeesString(record.amount_paise),
        occurred_on: record.occurred_on,
        due_date: record.due_date ?? "",
        status: record.status,
        settled_on: record.settled_on ?? (record.status === "settled" ? todayISO() : ""),
        account_id: record.account_id ?? "",
        note: record.note ?? "",
      });
    } else {
      reset(blankValues());
    }
  }, [open, record, reset]);

  async function onSubmit(v: BorrowFormValues) {
    setError(null);
    try {
      const db = createClient();
      if (record) {
        await updateBorrowRecord(db, record.id, v);
        notify("success", `Updated record for ${v.person_name}.`);
      } else {
        await createBorrowRecord(db, v);
        notify("success", `Added record for ${v.person_name}.`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Could not save borrow/lend record."));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={record ? "Edit Borrow / Lend Record" : "Add Borrow / Lend Record"}
      wide
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError message={error} />

        {/* Type Selection: Lent (I Gave) vs Borrowed (I Took) */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">
            Transaction Type
          </label>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:border dark:border-white/10 dark:bg-[#141414]">
            <button
              type="button"
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition cursor-pointer ${
                selectedType === "lent"
                  ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-zinc-950"
                  : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
              onClick={() => setValue("type", "lent")}
            >
              <ArrowUpRight className="h-4 w-4" />
              I Gave / Lent (They owe me)
            </button>
            <button
              type="button"
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition cursor-pointer ${
                selectedType === "borrowed"
                  ? "bg-amber-600 text-white shadow-sm dark:bg-amber-500 dark:text-zinc-950"
                  : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
              onClick={() => setValue("type", "borrowed")}
            >
              <ArrowDownLeft className="h-4 w-4" />
              I Took / Borrowed (I owe them)
            </button>
          </div>
        </div>

        {/* Person Name & Amount */}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Person Name"
            placeholder="e.g. Ramesh, Priya, Rahul Sharma"
            {...register("person_name")}
            error={errors.person_name?.message}
            autoFocus
          />

          <FieldShell
            label="Amount (₹)"
            error={errors.amount?.message}
            hint="Amount given or taken in Rupees"
          >
            {(id, d) => (
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-slate-500">₹</span>
                <input
                  id={id}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-invalid={!!errors.amount}
                  aria-describedby={d}
                  {...register("amount")}
                  className={`num h-10 w-full rounded-lg border bg-white pl-8 pr-3 text-sm font-semibold ${
                    errors.amount
                      ? "border-red-400 focus:border-red-500"
                      : "border-slate-300 focus:border-brand-500"
                  } focus:outline-none transition-colors`}
                />
              </div>
            )}
          </FieldShell>
        </div>

        {/* Date Given/Taken & Due Date */}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Date Given / Taken"
            type="date"
            {...register("occurred_on")}
            error={errors.occurred_on?.message}
          />

          <TextField
            label="Due Date (optional)"
            type="date"
            {...register("due_date")}
            error={errors.due_date?.message}
          />
        </div>

        {/* Status: Pending vs Settled / Done */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">
            Payment Status
          </label>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:border dark:border-white/10 dark:bg-[#141414]">
            <button
              type="button"
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedStatus === "pending"
                  ? "bg-amber-500 text-white shadow-sm dark:bg-amber-500 dark:text-zinc-950"
                  : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
              onClick={() => {
                setValue("status", "pending");
                setValue("settled_on", "");
              }}
            >
              <Clock className="h-3.5 w-3.5" />
              Pending / Unpaid
            </button>
            <button
              type="button"
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold transition cursor-pointer ${
                selectedStatus === "settled"
                  ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-500 dark:text-zinc-950"
                  : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
              onClick={() => {
                setValue("status", "settled");
                if (!watch("settled_on")) setValue("settled_on", todayISO());
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Settled / Paid (Done)
            </button>
          </div>
        </div>

        {/* Settled On Date (visible when status is settled) */}
        {selectedStatus === "settled" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <TextField
              label="Settlement Date (Date paid / received)"
              type="date"
              {...register("settled_on")}
              error={errors.settled_on?.message}
            />
          </div>
        )}

        {/* Account and Note */}
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.length > 0 ? (
            <SelectField label="Account (optional)" {...register("account_id")}>
              <option value="">No account linked</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </SelectField>
          ) : (
            <div />
          )}

          <TextField
            label="Note / Purpose (optional)"
            placeholder="e.g. Urgent loan for medical, Dinner split, Project advance"
            {...register("note")}
            error={errors.note?.message}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {record ? "Save Changes" : "Save Record"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
