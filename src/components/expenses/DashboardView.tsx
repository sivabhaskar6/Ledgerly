"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useMemo } from "react";
import { Plus, Landmark, CandlestickChart, Rocket, HandCoins } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_FILTERS, errorMessage, fetchSummary } from "@/lib/data/expenses";
import { fetchAllIncome, type Income } from "@/lib/data/income";
import { fetchAccountsWithBalances } from "@/lib/data/accounts";
import { fetchInvestments } from "@/lib/data/investments";
import { presetRange, todayISO, displayDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import type { ExpenseWithRefs } from "@/types/db";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

type PeriodFilter = "today" | "week" | "month" | "year" | "all";

const PERIODS: { key: PeriodFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
  { key: "all", label: "All Time" },
];

export function DashboardView() {
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allExpenses, setAllExpenses] = useState<ExpenseWithRefs[]>([]);
  const [allIncome, setAllIncome] = useState<Income[]>([]);
  const [todayExpense, setTodayExpense] = useState(0);
  const [weekExpense, setWeekExpense] = useState(0);
  const [monthExpense, setMonthExpense] = useState(0);
  const [yearExpense, setYearExpense] = useState(0);
  const [liquidCash, setLiquidCash] = useState<number | null>(null);
  const [invValue, setInvValue] = useState<number | null>(null);
  const [invNote, setInvNote] = useState<string | undefined>();
  const [netWorth, setNetWorth] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const today = todayISO();
      const w = presetRange("week");
      const m = presetRange("month");
      const y = presetRange("year");

      const [yearSum, weekSum, incList, accResult, invResult, expResult] = await Promise.all([
        fetchSummary(db, { ...DEFAULT_FILTERS, from: y.from, to: y.to }, today, m.from, m.to),
        fetchSummary(db, { ...DEFAULT_FILTERS, from: w.from, to: w.to }, today, m.from, m.to),
        fetchAllIncome(db).catch(() => ({ rows: [] as Income[], count: 0 })),
        fetchAccountsWithBalances(db).catch(() => null),
        fetchInvestments(db).catch(() => null),
        db
          .from("transactions")
          .select("*, category:categories(name), account:accounts(name)")
          .is("deleted_at", null)
          .order("occurred_on", { ascending: false })
          .order("created_at", { ascending: false })
          .range(0, 499),
      ]);

      const cash = accResult?.accounts.length ? accResult.totalLiquidPaise : null;
      let val: number | null = null;
      let note: string | undefined;

      if (invResult?.holdings.length) {
        if (invResult.totalMarketValuePaise !== null) {
          val = invResult.totalMarketValuePaise;
        } else {
          val = invResult.totalInvestedPaise;
          note = "Cost basis (market prices unconfigured)";
        }
      } else if (invResult) {
        val = 0;
      }

      let nw: number | null = null;
      if (cash !== null || val !== null) {
        nw = (cash ?? 0) + (val ?? 0) + (accResult?.totalBrokeragePaise ?? 0);
      }

      setTodayExpense(yearSum.today);
      setWeekExpense(weekSum.total);
      setMonthExpense(yearSum.month);
      setYearExpense(yearSum.total);
      setLiquidCash(cash);
      setInvValue(val);
      setInvNote(note);
      setNetWorth(nw);

      setAllIncome(incList.rows);
      setAllExpenses((expResult.data ?? []) as ExpenseWithRefs[]);
    } catch (e) {
      setError(errorMessage(e, "Could not load your overview."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Derived metrics dynamically reflecting the active time filter
  const {
    filteredExpenses,
    periodSpentPaise,
    periodIncomePaise,
    periodSurplusPaise,
    periodLabel,
    viewExpensesUrl,
  } = useMemo(() => {
    const today = todayISO();
    const w = presetRange("week");
    const m = presetRange("month");
    const y = presetRange("year");

    let filteredExp: ExpenseWithRefs[] = [];
    let spent = 0;
    let income = 0;
    let label = "This Month";
    let expUrl = `/expenses?from=${m.from}&to=${m.to}`;

    if (period === "today") {
      label = "Today";
      filteredExp = allExpenses.filter((e) => e.occurred_on === today);
      spent = todayExpense;
      income = allIncome
        .filter((i) => i.occurred_on === today)
        .reduce((acc, curr) => acc + curr.amount_paise, 0);
      expUrl = `/expenses?from=${today}&to=${today}`;
    } else if (period === "week") {
      label = "This Week";
      filteredExp = allExpenses.filter((e) => e.occurred_on >= w.from && e.occurred_on <= w.to);
      spent = weekExpense;
      income = allIncome
        .filter((i) => i.occurred_on >= w.from && i.occurred_on <= w.to)
        .reduce((acc, curr) => acc + curr.amount_paise, 0);
      expUrl = `/expenses?from=${w.from}&to=${w.to}`;
    } else if (period === "month") {
      label = "This Month";
      filteredExp = allExpenses.filter((e) => e.occurred_on >= m.from && e.occurred_on <= m.to);
      spent = monthExpense;
      income = allIncome
        .filter((i) => i.occurred_on >= m.from && i.occurred_on <= m.to)
        .reduce((acc, curr) => acc + curr.amount_paise, 0);
      expUrl = `/expenses?from=${m.from}&to=${m.to}`;
    } else if (period === "year") {
      label = "This Year";
      filteredExp = allExpenses.filter((e) => e.occurred_on >= y.from && e.occurred_on <= y.to);
      spent = yearExpense;
      income = allIncome
        .filter((i) => i.occurred_on >= y.from && i.occurred_on <= y.to)
        .reduce((acc, curr) => acc + curr.amount_paise, 0);
      expUrl = `/expenses?from=${y.from}&to=${y.to}`;
    } else {
      label = "All Time";
      filteredExp = allExpenses;
      spent = allExpenses.reduce((acc, curr) => acc + curr.amount_paise, 0);
      income = allIncome.reduce((acc, curr) => acc + curr.amount_paise, 0);
      expUrl = "/expenses";
    }

    return {
      filteredExpenses: filteredExp,
      periodSpentPaise: spent,
      periodIncomePaise: income,
      periodSurplusPaise: income - spent,
      periodLabel: label,
      viewExpensesUrl: expUrl,
    };
  }, [period, allExpenses, allIncome, todayExpense, weekExpense, monthExpense, yearExpense]);

  // Total year income calculation
  const yearIncomePaise = useMemo(() => {
    const y = presetRange("year");
    return allIncome
      .filter((i) => i.occurred_on >= y.from && i.occurred_on <= y.to)
      .reduce((acc, curr) => acc + curr.amount_paise, 0);
  }, [allIncome]);

  // Construct the 9 cards dynamically according to the active filter
  const cards = useMemo(() => {
    const today = todayISO();
    const w = presetRange("week");
    const m = presetRange("month");

    // Row 1: Spending cards
    let card1 = {
      label: `Spent (${periodLabel})`,
      value: !loading ? formatINR(periodSpentPaise) : null,
      href: viewExpensesUrl,
      colorClass: undefined as string | undefined,
      note: undefined as string | undefined,
    };
    let card2 = {
      label: "Spent this month",
      value: !loading ? formatINR(monthExpense) : null,
      href: `/expenses?from=${m.from}&to=${m.to}`,
      colorClass: undefined as string | undefined,
      note: undefined as string | undefined,
    };
    let card3 = {
      label: "Spent this year",
      value: !loading ? formatINR(yearExpense) : null,
      href: "/reports",
      colorClass: undefined as string | undefined,
      note: undefined as string | undefined,
    };

    if (period === "month") {
      card1 = {
        label: "Spent today",
        value: !loading ? formatINR(todayExpense) : null,
        href: `/expenses?from=${today}&to=${today}`,
        colorClass: undefined,
        note: undefined,
      };
      card2 = {
        label: "Spent this month",
        value: !loading ? formatINR(monthExpense) : null,
        href: `/expenses?from=${m.from}&to=${m.to}`,
        colorClass: undefined,
        note: undefined,
      };
    } else if (period === "today") {
      card1 = {
        label: "Spent today",
        value: !loading ? formatINR(todayExpense) : null,
        href: `/expenses?from=${today}&to=${today}`,
        colorClass: undefined,
        note: undefined,
      };
      card2 = {
        label: "Spent this month",
        value: !loading ? formatINR(monthExpense) : null,
        href: `/expenses?from=${m.from}&to=${m.to}`,
        colorClass: undefined,
        note: undefined,
      };
    } else if (period === "week") {
      card1 = {
        label: "Spent this week",
        value: !loading ? formatINR(weekExpense) : null,
        href: `/expenses?from=${w.from}&to=${w.to}`,
        colorClass: undefined,
        note: undefined,
      };
      card2 = {
        label: "Spent this month",
        value: !loading ? formatINR(monthExpense) : null,
        href: `/expenses?from=${m.from}&to=${m.to}`,
        colorClass: undefined,
        note: undefined,
      };
    } else if (period === "year") {
      card1 = {
        label: "Spent this month",
        value: !loading ? formatINR(monthExpense) : null,
        href: `/expenses?from=${m.from}&to=${m.to}`,
        colorClass: undefined,
        note: undefined,
      };
      card2 = {
        label: "Spent this year",
        value: !loading ? formatINR(yearExpense) : null,
        href: "/reports",
        colorClass: undefined,
        note: undefined,
      };
      card3 = {
        label: "Spent all time",
        value: !loading ? formatINR(periodSpentPaise) : null,
        href: "/expenses",
        colorClass: undefined,
        note: undefined,
      };
    } else if (period === "all") {
      card1 = {
        label: "Spent this year",
        value: !loading ? formatINR(yearExpense) : null,
        href: "/reports",
        colorClass: undefined,
        note: undefined,
      };
      card2 = {
        label: "Spent all time",
        value: !loading ? formatINR(periodSpentPaise) : null,
        href: "/expenses",
        colorClass: undefined,
        note: undefined,
      };
      card3 = {
        label: "Total transactions",
        value: !loading ? `${allExpenses.length} entries` : null,
        href: "/expenses",
        colorClass: "text-slate-800",
        note: undefined,
      };
    }

    // Row 2: Income and Surplus cards (reflects active period)
    const card4 = {
      label: `Income (${periodLabel})`,
      value: !loading
        ? periodIncomePaise >= 0
          ? `+${formatINR(periodIncomePaise)}`
          : formatINR(periodIncomePaise)
        : null,
      note: "Includes F&O & IPO listing gains",
      href: "/income",
      colorClass: undefined,
    };
    const card5 = {
      label: "Income this year",
      value: !loading
        ? yearIncomePaise >= 0
          ? `+${formatINR(yearIncomePaise)}`
          : formatINR(yearIncomePaise)
        : null,
      note: undefined,
      href: "/income",
      colorClass: undefined,
    };
    const card6 = {
      label: `Left (${periodLabel})`,
      value: !loading
        ? periodSurplusPaise >= 0
          ? `+${formatINR(periodSurplusPaise)}`
          : formatINR(periodSurplusPaise)
        : null,
      note: "Income − Spent",
      href: "/monthly-trends",
      colorClass: undefined,
    };

    // Row 3: Net Worth & Assets
    const card7 = {
      label: "Available cash & bank",
      value: liquidCash !== null ? formatINR(liquidCash) : null,
      note: liquidCash === null ? "No accounts added yet" : undefined,
      href: "/accounts",
      colorClass: "text-slate-900",
    };
    const card8 = {
      label: "Investment portfolio",
      value: invValue !== null ? formatINR(invValue) : null,
      note: invNote || (invValue === null ? "No investments recorded" : undefined),
      href: "/investments",
      colorClass: "text-slate-900",
    };
    const card9 = {
      label: "Liquid net worth",
      value: netWorth !== null ? formatINR(netWorth) : null,
      note: netWorth === null ? "Set up accounts & holdings" : "Cash + Demat + Holdings",
      href: "/accounts",
      colorClass: "text-slate-900",
    };

    return [card1, card2, card3, card4, card5, card6, card7, card8, card9];
  }, [
    period,
    periodLabel,
    periodSpentPaise,
    periodIncomePaise,
    periodSurplusPaise,
    viewExpensesUrl,
    monthExpense,
    yearExpense,
    todayExpense,
    weekExpense,
    allExpenses.length,
    yearIncomePaise,
    liquidCash,
    invValue,
    invNote,
    netWorth,
    loading,
  ]);

  // Display only the first 10 transactions in the scrollable view
  const displayedExpenses = useMemo(() => {
    return filteredExpenses.slice(0, 10);
  }, [filteredExpenses]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header Bar */}
      <div className="mb-2 flex items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Dashboard</h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">
            A real-time overview of your finances.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick Access links: hidden on mobile, visible on tablet/desktop */}
          <div className="hidden sm:flex sm:items-center sm:gap-2">
            <Link
              href="/accounts"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-200 hover:text-slate-900 transition dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300 dark:hover:bg-[#222222] dark:hover:text-white"
            >
              <Landmark className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Accounts</span>
            </Link>
            <Link
              href="/income"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-200 hover:text-slate-900 transition dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300 dark:hover:bg-[#222222] dark:hover:text-white"
            >
              <Plus className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Income</span>
            </Link>
            <Link
              href="/fno"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-200 hover:text-slate-900 transition dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300 dark:hover:bg-[#222222] dark:hover:text-white"
            >
              <CandlestickChart className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>F&O</span>
            </Link>
            <Link
              href="/ipo"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-200 hover:text-slate-900 transition dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300 dark:hover:bg-[#222222] dark:hover:text-white"
            >
              <Rocket className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>IPO</span>
            </Link>
            <Link
              href="/borrowing"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-200 hover:text-slate-900 transition dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300 dark:hover:bg-[#222222] dark:hover:text-white"
            >
              <HandCoins className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
              <span>Borrow & Lend</span>
            </Link>
          </div>
          <Link href="/expenses">
            <Button className="h-9 px-3.5 text-xs font-semibold shadow-xs">
              <Plus className="h-4 w-4 mr-1.5" aria-hidden />
              Add expense
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 shrink-0"
        >
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {/* Filter Section - compact pills */}
      <div className="mb-2 flex items-center justify-between shrink-0">
        <div className="filter-capsule">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={period === p.key ? "filter-pill-active" : "filter-pill-inactive"}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Head Boxes - Fixed, Compact (no empty space), matches other sections */}
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 shrink-0">
        {cards.map((c) => (
          <div
            key={c.label}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]"
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 truncate dark:text-zinc-400">{c.label}</p>
              {c.href && (
                <Link
                  href={c.href}
                  className="text-[10px] sm:text-[11px] font-medium text-brand-700 hover:underline shrink-0 dark:text-zinc-400 dark:hover:text-white transition-colors"
                >
                  View →
                </Link>
              )}
            </div>
            <div className="mt-0.5">
              {loading ? (
                <Skeleton className="h-6 w-24" />
              ) : c.value !== null ? (
                <p
                  className={`num text-base sm:text-lg font-bold md:text-xl ${
                    c.colorClass ??
                    (c.value.startsWith("-")
                      ? "text-rose-700 dark:text-rose-400"
                      : c.value.startsWith("+")
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-slate-900 dark:text-white")
                  }`}
                >
                  {c.value}
                </p>
              ) : (
                <p className="num text-base sm:text-lg font-bold text-slate-300 md:text-xl dark:text-zinc-600">—</p>
              )}
            </div>
            <div className="min-h-[14px]">
              {c.note && (
                <p className="text-[9px] sm:text-[10px] text-slate-400 truncate dark:text-zinc-500">{c.note}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Transactions Section Heading */}
      <div className="mb-1.5 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-semibold tracking-wider text-slate-700 dark:text-zinc-300">
          Recent Transactions ({periodLabel})
        </h2>
        <Link
          href={viewExpensesUrl}
          className="text-xs font-medium text-brand-700 hover:underline dark:text-zinc-400 dark:hover:text-white transition-colors"
        >
          View all expenses →
        </Link>
      </div>

      {/* Recent Transactions Box - ONLY this box scrolls, up to 10 entries */}
      <div className="flex-1 min-h-0 flex flex-col">
        {loading && allExpenses.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : displayedExpenses.length === 0 && !error ? (
          <EmptyState
            title={`No expenses recorded for ${periodLabel.toLowerCase()}`}
            body="Add an expense or import a statement and it will show up here."
            action={
              <Link href="/expenses">
                <Button className="h-9 px-3.5 text-xs font-semibold shadow-xs">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add expense
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto rounded-card border border-slate-200 bg-white shadow-sm flex flex-col dark:border-white/10 dark:bg-[#141414]">
            <ul className="divide-y divide-slate-100 flex-1 dark:divide-white/5">
              {displayedExpenses.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-slate-50 transition-colors dark:hover:bg-white/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs md:text-sm font-semibold text-slate-900 dark:text-zinc-100">
                      {e.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      {e.category?.name ?? "—"} · {displayDate(e.occurred_on)}
                      {e.account?.name ? ` · ${e.account.name}` : ""}
                    </p>
                  </div>
                  <p className="num shrink-0 text-xs md:text-sm font-bold text-rose-700">
                    {formatINR(e.amount_paise)}
                  </p>
                </li>
              ))}
            </ul>
            {filteredExpenses.length > 10 && (
              <div className="border-t border-slate-100 bg-slate-50/70 px-3.5 py-1.5 text-right shrink-0 dark:border-white/10 dark:bg-[#181818]">
                <Link
                  href={viewExpensesUrl}
                  className="text-xs font-semibold text-brand-700 hover:underline dark:text-zinc-300 dark:hover:text-white transition-colors"
                >
                  Showing 10 of {filteredExpenses.length} expenses · View all with current filter →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
