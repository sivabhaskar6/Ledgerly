"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  CandlestickChart,
} from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/data/expenses";
import {
  createIncome,
  deleteIncome,
  fetchIncome,
  fetchIncomeSummary,
  INCOME_PAGE_SIZE,
  updateIncome,
  type Income,
} from "@/lib/data/income";
import {
  incomeFormSchema,
  INCOME_SOURCES,
  parseIncomeEntryType,
  type IncomeFormValues,
} from "@/lib/validations/income";
import { formatINR, paiseToRupeesString } from "@/lib/utils/money";
import { displayDate, todayISO } from "@/lib/utils/dates";
import { PageHeader } from "@/components/layout/PageHeader";
import { FormError } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldShell, SelectField, TextField } from "@/components/ui/Field";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

const sourceLabel = (v: string) =>
  INCOME_SOURCES.find((s) => s.value === v)?.label ?? v;

const blank = (): IncomeFormValues => ({
  title: "",
  source: "stock_profit",
  entry_type: "profit",
  occurred_on: todayISO(),
  amount: "",
  note: "",
});

export function IncomeView() {
  const { notify } = useToast();
  const [rows, setRows] = useState<Income[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [sum, setSum] = useState<{ today: number; month: number; year: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Income | "new" | null>(null);
  const [deleting, setDeleting] = useState<Income | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const [list, s] = await Promise.all([
        fetchIncome(db, page),
        fetchIncomeSummary(db),
      ]);
      setRows(list.rows);
      setCount(list.count);
      setSum(s);
    } catch (e) {
      setError(errorMessage(e, "Could not load income."));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteIncome(createClient(), deleting.id);
      notify("success", "Income entry removed.");
      setDeleting(null);
      await load();
    } catch (e) {
      notify("error", errorMessage(e, "Could not delete the entry."));
    } finally {
      setBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil(count / INCOME_PAGE_SIZE));
  const cards = [
    { label: "Earned today", val: sum?.today, hint: "Today's net earnings" },
    { label: "Earned this month", val: sum?.month, hint: "Includes realized F&O P&L" },
    { label: "Earned this year", val: sum?.year, hint: "Year-to-date total" },
  ] as const;

  return (
    <>
      <PageHeader
        title="Income"
        description="Profit and money earned (including realized F&O trading gains & loss deductions). Original capital is tracked separately under Capital."
        actions={
          <div className="flex gap-2">
            <Link href="/fno">
              <Button variant="secondary">
                <CandlestickChart className="h-4 w-4" aria-hidden />
                F&O Journal
              </Button>
            </Link>
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" aria-hidden />
              Add income
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <dl className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map(({ label, val, hint }) => {
          const isPos = (val ?? 0) >= 0;
          return (
            <div
              key={label}
              className="rounded-card border border-slate-200 bg-white p-3 md:p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <dt className="text-xs font-medium text-slate-500">{label}</dt>
                {val !== undefined &&
                  (isPos ? (
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-rose-600" />
                  ))}
              </div>
              <dd
                className={`num mt-1 text-xl font-bold md:text-2xl ${
                  isPos ? "text-emerald-700" : "text-rose-700"
                }`}
              >
                {val === undefined
                  ? "—"
                  : isPos
                  ? `+${formatINR(val)}`
                  : formatINR(val)}
              </dd>
              <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
            </div>
          );
        })}
      </dl>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <ListSkeleton rows={4} />
      ) : rows.length === 0 && !error ? (
        <EmptyState
          title="No income recorded yet"
          body="Add profit from selling shares, F&O trading gains/losses, IPO listing gains, dividends or interest."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" aria-hidden />
              Add income
            </Button>
          }
        />
      ) : (
        <div className={loading ? "opacity-60" : ""}>
          <ul className="divide-y divide-slate-100 rounded-card border border-slate-200 bg-white shadow-sm">
            {rows.map((r) => {
              const isProfit = r.amount_paise >= 0;
              const isFno = r.source === "fno_trading";

              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 p-3 md:p-4 transition hover:bg-slate-50/70"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-slate-900">{r.title}</p>
                      {isFno && (
                        <span className="inline-flex shrink-0 items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                          F&O Trade
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {sourceLabel(r.source)} · {displayDate(r.occurred_on)}
                    </p>
                    {r.note && (
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {r.note}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`num font-bold text-sm md:text-base ${
                        isProfit ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {isProfit ? `+${formatINR(r.amount_paise)}` : formatINR(r.amount_paise)}
                    </span>
                    <button
                      aria-label={`Edit ${r.title}`}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                      onClick={() => setEditing(r)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Delete ${r.title}`}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                      onClick={() => setDeleting(r)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <nav
            aria-label="Pagination"
            className="mt-4 flex items-center justify-between text-sm text-slate-600"
          >
            <span className="num">
              Page {page + 1} of {pages} · {count} {count === 1 ? "entry" : "entries"}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="h-9 px-3"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="secondary"
                className="h-9 px-3"
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </nav>
        </div>
      )}

      <IncomeForm
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Delete this income entry?"
        busy={busy}
        confirmLabel="Delete entry"
        body={
          deleting
            ? `"${deleting.title}" (${
                deleting.amount_paise >= 0
                  ? `+${formatINR(deleting.amount_paise)}`
                  : formatINR(deleting.amount_paise)
              }) will be permanently removed from your income totals.`
            : ""
        }
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

function IncomeForm({
  target,
  onClose,
  onSaved,
}: {
  target: Income | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const [error, setError] = useState<string | null>(null);
  const existing = target && target !== "new" ? target : null;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeFormSchema),
    defaultValues: blank(),
  });

  const entryType = watch("entry_type") ?? "profit";

  useEffect(() => {
    if (!target) return;
    setError(null);
    if (existing) {
      const type = parseIncomeEntryType(existing.amount_paise);
      const absAmount = Math.abs(existing.amount_paise);
      reset({
        title: existing.title,
        source: existing.source as IncomeFormValues["source"],
        entry_type: type,
        occurred_on: existing.occurred_on,
        amount: paiseToRupeesString(absAmount),
        note: existing.note ?? "",
      });
    } else {
      reset(blank());
    }
  }, [target, existing, reset]);

  async function onSubmit(v: IncomeFormValues) {
    setError(null);
    try {
      const db = createClient();
      if (existing) {
        await updateIncome(db, existing.id, v);
      } else {
        await createIncome(db, v);
      }
      notify("success", existing ? "Income updated." : "Income added.");
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Could not save the income entry."));
    }
  }

  const isFnoEntry = existing?.source === "fno_trading";

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={existing ? "Edit income entry" : "Add income entry"}
      wide
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError message={error} />

        {isFnoEntry && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800">
            <p className="font-semibold">Linked to F&O Trading Journal</p>
            <p className="mt-0.5">
              This entry represents realized trading P&L. To record strike price, buy/sell prices, and brokerage charges, consider managing it directly in the{" "}
              <Link href="/fno" className="font-medium underline hover:text-violet-950">
                F&O Trading section
              </Link>
              .
            </p>
          </div>
        )}

        {/* Profit vs Loss Segmented Control */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">
            Entry Type
          </label>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition ${
                entryType === "profit"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setValue("entry_type", "profit")}
            >
              <TrendingUp className="h-3.5 w-3.5" />
              + Profit / Gain (adds to income)
            </button>
            <button
              type="button"
              className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition ${
                entryType === "loss"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              onClick={() => setValue("entry_type", "loss")}
            >
              <TrendingDown className="h-3.5 w-3.5" />
              − Loss / Reduction (deducts from income)
            </button>
          </div>
        </div>

        <TextField
          label="Title"
          placeholder={
            entryType === "loss"
              ? "e.g. F&O Loss: NIFTY 24500 CE or Intraday stoploss"
              : "e.g. Sold TCS shares or F&O Profit: NIFTY CE"
          }
          {...register("title")}
          error={errors.title?.message}
          autoFocus
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FieldShell
            label={
              entryType === "loss"
                ? "Loss amount (₹)"
                : "Profit / Gain amount (₹)"
            }
            error={errors.amount?.message}
            hint={
              entryType === "loss"
                ? "Amount to deduct from your income."
                : "Net profit earned (not capital invested)."
            }
          >
            {(id, d) => (
              <div className="relative">
                <span
                  className={`absolute left-3 top-2.5 font-bold ${
                    entryType === "loss" ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {entryType === "loss" ? "−₹" : "+₹"}
                </span>
                <input
                  id={id}
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-invalid={!!errors.amount}
                  aria-describedby={d}
                  {...register("amount")}
                  className={`num h-10 w-full rounded-lg border bg-white pl-8 pr-3 text-sm font-semibold ${
                    errors.amount
                      ? "border-red-400"
                      : entryType === "loss"
                      ? "border-rose-300 focus:border-rose-500"
                      : "border-emerald-300 focus:border-emerald-500"
                  }`}
                />
              </div>
            )}
          </FieldShell>

          <TextField
            label="Date"
            type="date"
            {...register("occurred_on")}
            error={errors.occurred_on?.message}
          />
        </div>

        <SelectField label="Type of income" {...register("source")}>
          {INCOME_SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </SelectField>

        <TextField
          label="Note (optional)"
          placeholder="e.g. Brokerage breakdown, trading strategy, or reason"
          {...register("note")}
          error={errors.note?.message}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {existing ? "Save changes" : "Add income"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
