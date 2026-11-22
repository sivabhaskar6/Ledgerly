"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  CandlestickChart,
  Rocket,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/data/expenses";
import {
  createIncome,
  deleteIncome,
  fetchAllIncome,
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
import { displayDate, todayISO, presetRange } from "@/lib/utils/dates";
import { FormError } from "@/components/layout/AuthShell";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldShell, SelectField, TextField } from "@/components/ui/Field";
import { ListSkeleton, Skeleton } from "@/components/ui/Skeleton";
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
  const [allRows, setAllRows] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Income | "new" | null>(null);
  const [deleting, setDeleting] = useState<Income | null>(null);
  const [busy, setBusy] = useState(false);

  // Filter State
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const list = await fetchAllIncome(db);
      setAllRows(list.rows);
    } catch (e) {
      setError(errorMessage(e, "Could not load income."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteIncome(createClient(), deleting.id);
      notify("success", "Income entry moved to Recently deleted.");
      setDeleting(null);
      await load();
    } catch (e) {
      notify("error", errorMessage(e, "Could not delete the entry."));
    } finally {
      setBusy(false);
    }
  }

  // Filtered rows
  const filteredRows = useMemo(() => {
    const today = todayISO();
    const w = presetRange("week");
    const m = presetRange("month");
    const y = presetRange("year");

    return allRows.filter((r) => {
      // Search filter
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const match =
          r.title.toLowerCase().includes(q) ||
          r.source.toLowerCase().includes(q) ||
          (r.note && r.note.toLowerCase().includes(q));
        if (!match) return false;
      }

      // Source filter
      if (sourceFilter !== "all" && r.source !== sourceFilter) {
        return false;
      }

      // Outcome filter
      if (outcomeFilter === "profit" && r.amount_paise <= 0) return false;
      if (outcomeFilter === "loss" && r.amount_paise >= 0) return false;

      // Date filter
      if (dateFilter === "today" && r.occurred_on !== today) return false;
      if (dateFilter === "week" && (r.occurred_on < w.from || r.occurred_on > w.to)) return false;
      if (dateFilter === "month" && (r.occurred_on < m.from || r.occurred_on > m.to)) return false;
      if (dateFilter === "year" && (r.occurred_on < y.from || r.occurred_on > y.to)) return false;
      if (dateFilter === "fy") {
        const fy = presetRange("fy");
        if (r.occurred_on < fy.from || r.occurred_on > fy.to) return false;
      }

      return true;
    });
  }, [allRows, search, sourceFilter, outcomeFilter, dateFilter]);

  // Derived KPI metrics that dynamically reflect the active filters
  const kpiMetrics = useMemo(() => {
    let total = 0;
    let gains = 0;
    let losses = 0;
    let gainsCount = 0;
    let lossesCount = 0;

    for (const r of filteredRows) {
      total += r.amount_paise;
      if (r.amount_paise > 0) {
        gains += r.amount_paise;
        gainsCount++;
      } else if (r.amount_paise < 0) {
        losses += r.amount_paise;
        lossesCount++;
      }
    }

    return {
      totalPaise: total,
      gainsPaise: gains,
      lossesPaise: losses,
      gainsCount,
      lossesCount,
      totalCount: filteredRows.length,
    };
  }, [filteredRows]);

  // Derived current month net P&L across income (including F&O trades and IPO gains)
  const monthPnl = useMemo(() => {
    const m = presetRange("month");
    let total = 0;
    let profitCount = 0;
    let lossCount = 0;
    for (const r of allRows) {
      if (sourceFilter !== "all" && r.source !== sourceFilter) continue;
      if (r.occurred_on >= m.from && r.occurred_on <= m.to) {
        total += r.amount_paise;
        if (r.amount_paise > 0) {
          profitCount++;
        } else if (r.amount_paise < 0) {
          lossCount++;
        }
      }
    }
    return {
      totalPaise: total,
      profitCount,
      lossCount,
    };
  }, [allRows, sourceFilter]);

  const pages = Math.max(1, Math.ceil(filteredRows.length / INCOME_PAGE_SIZE));
  const paginatedRows = useMemo(() => {
    const from = page * INCOME_PAGE_SIZE;
    return filteredRows.slice(from, from + INCOME_PAGE_SIZE);
  }, [filteredRows, page]);

  const periodLabel =
    dateFilter === "today"
      ? "Earned today"
      : dateFilter === "week"
      ? "Earned this week"
      : dateFilter === "month"
      ? "Selected Month Net"
      : dateFilter === "year"
      ? "Earned this year"
      : "Total Net Income";

  const cards = [
    {
      label: periodLabel,
      val: kpiMetrics.totalPaise,
      hint: `${kpiMetrics.totalCount} ${kpiMetrics.totalCount === 1 ? "entry" : "entries"} in selection`,
    },
    {
      label: "Earned this month",
      val: monthPnl.totalPaise,
      hint: `${monthPnl.profitCount} profitable · ${monthPnl.lossCount} loss ${
        monthPnl.lossCount === 1 ? "entry" : "entries"
      }`,
    },
    {
      label: "Profits & Gains",
      val: kpiMetrics.gainsPaise,
      hint: `${kpiMetrics.gainsCount} profitable entries`,
    },
    {
      label: "Realized Losses",
      val: kpiMetrics.lossesPaise,
      hint: `${kpiMetrics.lossesCount} loss entries`,
    },
  ] as const;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header Bar */}
      <div className="mb-2 sm:mb-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">Income</h1>
          <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400">
            Profit and money earned (including realized F&O trading gains/losses and IPO listing gains). Original capital is tracked separately under Capital.
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/fno"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-200 hover:text-slate-900 transition dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300"
          >
            <CandlestickChart className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
            <span>F&O Journal</span>
          </Link>
          <Link
            href="/ipo"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-200 hover:text-slate-900 transition dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300"
          >
            <Rocket className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
            <span>IPO Gains</span>
          </Link>
          <Button
            onClick={() => setEditing("new")}
            className="h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs font-semibold shadow-xs"
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            Add income
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <dl className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4 shrink-0">
        {cards.map(({ label, val, hint }) => {
          const isPos = (val ?? 0) >= 0;
          return (
            <div
              key={label}
              className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]"
            >
              <div className="flex items-center justify-between">
                <dt className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400 truncate">{label}</dt>
                {val !== undefined &&
                  (isPos ? (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                  ))}
              </div>
              <dd
                className={`num mt-0.5 text-base sm:text-lg font-bold md:text-xl ${
                  isPos ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                }`}
              >
                {loading && allRows.length === 0 ? (
                  <Skeleton className="mt-1 h-6 w-20" />
                ) : val === undefined
                  ? "—"
                  : isPos
                  ? `+${formatINR(val)}`
                  : formatINR(val)}
              </dd>
              <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">{hint}</p>
            </div>
          );
        })}
      </dl>

      {error && (
        <div
          role="alert"
          className="mb-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 shrink-0"
        >
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xs shrink-0 dark:border-white/10 dark:bg-[#141414]">
        <div className="relative w-full sm:w-auto sm:min-w-[14rem] sm:flex-1 flex items-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search title, source, or note..."
            className="h-8 sm:h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs md:text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors dark:border-white/10 dark:bg-[#181818] dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs w-full sm:w-auto justify-between sm:justify-start">
          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPage(0);
            }}
            className="h-8 sm:h-9 flex-1 sm:flex-initial rounded-lg border border-slate-200 bg-white px-2 sm:px-2.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none transition-colors cursor-pointer dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300"
          >
            <option value="all">All Sources</option>
            <option value="fno_trading">F&O Trading</option>
            <option value="ipo_gain">IPO Listing Gain</option>
            {INCOME_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* Outcome Filter */}
          <select
            value={outcomeFilter}
            onChange={(e) => {
              setOutcomeFilter(e.target.value);
              setPage(0);
            }}
            className="h-8 sm:h-9 flex-1 sm:flex-initial rounded-lg border border-slate-200 bg-white px-2 sm:px-2.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none transition-colors cursor-pointer dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300"
          >
            <option value="all">All Outcomes</option>
            <option value="profit">Profits / Inflows Only</option>
            <option value="loss">Losses Only</option>
          </select>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setPage(0);
            }}
            className="h-8 sm:h-9 flex-1 sm:flex-initial rounded-lg border border-slate-200 bg-white px-2 sm:px-2.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none transition-colors cursor-pointer dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300"
          >
            <option value="all">All Time</option>
            <option value="today">Today Only</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="fy">This FY (Apr–Mar)</option>
          </select>
        </div>
      </div>

      {/* Income Records List & Pagination */}
      <div className="flex-1 min-h-0 flex flex-col">
        {loading && allRows.length === 0 ? (
          <ListSkeleton rows={4} />
        ) : filteredRows.length === 0 && !error ? (
          <EmptyState
            title={
              search || sourceFilter !== "all" || outcomeFilter !== "all" || dateFilter !== "all"
                ? "No matching income entries"
                : "No income recorded yet"
            }
            body={
              search || sourceFilter !== "all" || outcomeFilter !== "all" || dateFilter !== "all"
                ? "Try adjusting your search query, source, outcome, or date filters."
                : "Add profit from selling shares, F&O trading gains/losses, IPO listing gains, dividends or interest."
            }
            action={
              search || sourceFilter !== "all" || outcomeFilter !== "all" || dateFilter !== "all" ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch("");
                    setSourceFilter("all");
                    setOutcomeFilter("all");
                    setDateFilter("all");
                    setPage(0);
                  }}
                  className="h-8 sm:h-9 px-3.5 text-xs font-semibold shadow-xs"
                >
                  Clear filters
                </Button>
              ) : (
                <Button
                  onClick={() => setEditing("new")}
                  className="h-8 sm:h-9 px-3.5 text-xs font-semibold shadow-xs"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add income
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className={`flex-1 min-h-0 overflow-y-auto rounded-card border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#141414] ${loading ? "opacity-60" : ""}`}>
              <ul className="divide-y divide-slate-100 dark:divide-white/5">
                {paginatedRows.map((r) => {
                  const isProfit = r.amount_paise >= 0;
                  const isFno = r.source === "fno_trading";
                  const isIpo = r.source === "ipo_gain";

                  return (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-2.5 px-3 py-2 sm:px-4 sm:py-2.5 transition hover:bg-slate-50/70 dark:hover:bg-white/[0.03]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <p className="truncate text-xs md:text-sm font-semibold text-slate-900 dark:text-zinc-100">{r.title}</p>
                          {isFno && (
                            <span className="inline-flex shrink-0 items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.2 text-[9px] sm:text-[10px] font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300">
                              F&O
                            </span>
                          )}
                          {isIpo && (
                            <span className="inline-flex shrink-0 items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.2 text-[9px] sm:text-[10px] font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                              IPO
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400">
                          {sourceLabel(r.source)} · {displayDate(r.occurred_on)}
                        </p>
                        {r.note && (
                          <p className="mt-0.5 truncate text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400">
                            {r.note}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                        <span
                          className={`num font-bold text-xs md:text-sm ${
                            isProfit ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                          }`}
                        >
                          {isProfit ? `+${formatINR(r.amount_paise)}` : formatINR(r.amount_paise)}
                        </span>
                        <button
                          aria-label={`Edit ${r.title}`}
                          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
                          onClick={() => setEditing(r)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          aria-label={`Delete ${r.title}`}
                          className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-red-400"
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Pinned Bottom Pagination */}
            <nav
              aria-label="Pagination"
              className="shrink-0 mt-2 flex items-center justify-between text-xs text-slate-600 px-1"
            >
              <span className="num">
                Page {page + 1} of {pages} · {filteredRows.length} {filteredRows.length === 1 ? "entry" : "entries"}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  className="h-8 px-2.5 text-xs shadow-xs"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  className="h-8 px-2.5 text-xs shadow-xs"
                  disabled={page + 1 >= pages}
                  onClick={() => setPage(page + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </nav>
          </>
        )}
      </div>

      <IncomeForm
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => void load()}
      />

      <ConfirmDialog
        open={!!deleting}
        title="Move to Recently deleted?"
        busy={busy}
        confirmLabel="Move to trash"
        body={
          deleting
            ? `"${deleting.title}" (${
                deleting.amount_paise >= 0
                  ? `+${formatINR(deleting.amount_paise)}`
                  : formatINR(deleting.amount_paise)
              }) will be moved to Recently deleted.${
                deleting.source === "fno_trading"
                  ? " This will also move the trade from your F&O Journal and recalculate this month's income."
                  : deleting.source === "ipo_gain"
                  ? " This will also move the entry from your IPO Listing Gains section and recalculate this month's income."
                  : " You can restore it anytime."
              }`
            : ""
        }
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </div>
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
