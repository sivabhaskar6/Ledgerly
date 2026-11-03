"use client";
import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Minus, Sliders, AlertCircle } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { TextField, FieldShell } from "@/components/ui/Field";
import { FormError } from "@/components/layout/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { createCapitalEntry, updateCapitalEntry, type CapitalEntryWithDelta } from "@/lib/data/capital";
import { errorMessage } from "@/lib/data/expenses";
import {
  capitalFormSchema,
  computeCapitalPaise,
  type CapitalFormValues,
  type CapitalOperationMode,
} from "@/lib/validations/capital";
import { formatINR, paiseToRupeesString } from "@/lib/utils/money";
import { todayISO } from "@/lib/utils/dates";

type Props = {
  open: boolean;
  entry: CapitalEntryWithDelta | null;
  currentCapitalPaise: number | null;
  onClose: () => void;
  onSaved: () => void;
  notify: (type: "success" | "error", msg: string) => void;
};

export function CapitalFormModal({
  open,
  entry,
  currentCapitalPaise,
  onClose,
  onSaved,
  notify,
}: Props) {
  const [error, setError] = useState<string | null>(null);

  // Baseline capital before this entry
  const baselinePaise = useMemo(() => {
    if (entry) {
      if (entry.deltaPaise !== null) {
        return Math.max(0, entry.amount_paise - entry.deltaPaise);
      }
      return null;
    }
    return currentCapitalPaise;
  }, [entry, currentCapitalPaise]);

  const hasExisting = baselinePaise !== null && baselinePaise > 0;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CapitalFormValues>({
    resolver: zodResolver(capitalFormSchema),
    defaultValues: {
      mode: hasExisting ? "add" : "set",
      amount: "",
      occurred_on: todayISO(),
      note: "",
    },
  });

  const mode = watch("mode") as CapitalOperationMode;
  const amountStr = watch("amount");

  useEffect(() => {
    if (open) {
      setError(null);
      if (entry) {
        let initialMode: CapitalOperationMode = "set";
        let initialAmount = paiseToRupeesString(entry.amount_paise);

        if (entry.deltaPaise !== null && entry.deltaPaise > 0) {
          initialMode = "add";
          initialAmount = paiseToRupeesString(entry.deltaPaise);
        } else if (entry.deltaPaise !== null && entry.deltaPaise < 0) {
          initialMode = "remove";
          initialAmount = paiseToRupeesString(Math.abs(entry.deltaPaise));
        }

        reset({
          mode: initialMode,
          amount: initialAmount,
          occurred_on: entry.occurred_on,
          note: entry.note || "",
        });
      } else {
        reset({
          mode: hasExisting ? "add" : "set",
          amount: "",
          occurred_on: todayISO(),
          note: "",
        });
      }
    }
  }, [open, entry, hasExisting, reset]);

  // Live calculation of resulting capital
  const calculation = useMemo(() => {
    if (!amountStr || !amountStr.trim()) {
      return {
        valid: true,
        enteredPaise: null,
        resultingPaise: baselinePaise ?? 0,
        overdraft: false,
      };
    }
    try {
      const { resultingPaise, changePaise } = computeCapitalPaise(
        mode,
        amountStr,
        baselinePaise
      );
      return {
        valid: true,
        enteredPaise: Math.abs(changePaise),
        resultingPaise,
        overdraft: false,
      };
    } catch {
      return {
        valid: false,
        enteredPaise: null,
        resultingPaise: null,
        overdraft: mode === "remove",
      };
    }
  }, [mode, amountStr, baselinePaise]);

  async function onSubmit(v: CapitalFormValues) {
    setError(null);
    if (calculation.overdraft) {
      setError(`Cannot remove more than existing capital (${formatINR(baselinePaise ?? 0)}).`);
      return;
    }

    try {
      const db = createClient();
      if (entry) {
        await updateCapitalEntry(db, entry.id, v, baselinePaise);
        notify("success", "Capital entry updated.");
      } else {
        await createCapitalEntry(db, v, baselinePaise);
        notify("success", "Capital entry logged.");
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Could not save capital entry."));
    }
  }

  const title = entry
    ? "Edit capital entry"
    : hasExisting
    ? "Update current capital"
    : "Record initial capital";

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError message={error} />

        {/* Action picker if baseline capital exists */}
        {hasExisting && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">
              What would you like to do?
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setValue("mode", "add")}
                className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all ${
                  mode === "add"
                    ? "border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-600"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-1 font-semibold text-xs sm:text-sm">
                  <Plus className="h-4 w-4 text-emerald-600" aria-hidden />
                  <span>Add to Capital</span>
                </div>
                <span className="mt-0.5 text-[11px] text-slate-500">Deposit / Growth</span>
              </button>

              <button
                type="button"
                onClick={() => setValue("mode", "remove")}
                className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all ${
                  mode === "remove"
                    ? "border-rose-600 bg-rose-50 text-rose-950 shadow-sm ring-1 ring-rose-600"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-1 font-semibold text-xs sm:text-sm">
                  <Minus className="h-4 w-4 text-rose-600" aria-hidden />
                  <span>Remove from Capital</span>
                </div>
                <span className="mt-0.5 text-[11px] text-slate-500">Withdrawal</span>
              </button>

              <button
                type="button"
                onClick={() => setValue("mode", "set")}
                className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all ${
                  mode === "set"
                    ? "border-brand-600 bg-brand-50 text-brand-950 shadow-sm ring-1 ring-brand-600"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-1 font-semibold text-xs sm:text-sm">
                  <Sliders className="h-4 w-4 text-brand-600" aria-hidden />
                  <span>Set Exact Total</span>
                </div>
                <span className="mt-0.5 text-[11px] text-slate-500">Direct override</span>
              </button>
            </div>

            {/* Dynamic Math Preview Card */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600">
              <div className="flex items-center justify-between text-slate-500">
                <span>Existing Capital:</span>
                <span className="num font-semibold text-slate-800">
                  {formatINR(baselinePaise!)}
                </span>
              </div>

              {mode !== "set" && (
                <div className="mt-1 flex items-center justify-between">
                  <span>{mode === "add" ? "Amount to add:" : "Amount to remove:"}</span>
                  <span
                    className={`num font-semibold ${
                      mode === "add" ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {calculation.enteredPaise !== null
                      ? mode === "add"
                        ? `+${formatINR(calculation.enteredPaise)}`
                        : `-${formatINR(calculation.enteredPaise)}`
                      : "—"}
                  </span>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="font-semibold text-slate-900">New Total Capital:</span>
                <span className="num text-base font-bold text-slate-900">
                  {calculation.resultingPaise !== null
                    ? formatINR(calculation.resultingPaise)
                    : "—"}
                </span>
              </div>

              {calculation.overdraft && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-700">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    Cannot remove more than existing capital ({formatINR(baselinePaise!)}).
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell
            label={
              hasExisting
                ? mode === "add"
                  ? "Amount to add (₹)"
                  : mode === "remove"
                  ? "Amount to remove (₹)"
                  : "Total capital amount (₹)"
                : "Total capital amount (₹)"
            }
            error={errors.amount?.message}
          >
            {(id, d) => (
              <input
                id={id}
                inputMode="decimal"
                placeholder={
                  mode === "add"
                    ? "e.g. 50000.00"
                    : mode === "remove"
                    ? "e.g. 20000.00"
                    : "e.g. 160000.00"
                }
                aria-describedby={d}
                {...register("amount")}
                className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold ${
                  errors.amount || calculation.overdraft
                    ? "border-red-400"
                    : "border-slate-300"
                }`}
                autoFocus
              />
            )}
          </FieldShell>

          <TextField
            label="Date"
            type="date"
            {...register("occurred_on")}
            error={errors.occurred_on?.message}
          />
        </div>

        <TextField
          label="Note (optional)"
          placeholder={
            mode === "add"
              ? "e.g. Bonus addition, savings deposit"
              : mode === "remove"
              ? "e.g. Emergency withdrawal, big purchase"
              : "e.g. All bank and demat accounts total"
          }
          {...register("note")}
          error={errors.note?.message}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={calculation.overdraft}
          >
            {entry
              ? "Save changes"
              : mode === "add"
              ? "Add to capital"
              : mode === "remove"
              ? "Remove from capital"
              : "Record capital"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
