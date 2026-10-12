"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Landmark } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_FILTERS, errorMessage, fetchExpenses, fetchSummary } from "@/lib/data/expenses";
import { fetchIncomeSummary } from "@/lib/data/income";
import { fetchAccountsWithBalances } from "@/lib/data/accounts";
import { fetchInvestments } from "@/lib/data/investments";
import { presetRange, todayISO, displayDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import type { ExpenseWithRefs } from "@/types/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";

type DashboardMetrics = {
  todayExpense: number;
  monthExpense: number;
  yearExpense: number;
  monthIncome: number;
  yearIncome: number;
  liquidCashPaise: number | null;
  investmentValuePaise: number | null;
  investmentNote?: string;
  netWorthPaise: number | null;
};

export function DashboardView() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recent, setRecent] = useState<ExpenseWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const m = presetRange("month");
      const y = presetRange("year");

      const [yearSum, list, inc, accResult, invResult] = await Promise.all([
        fetchSummary(db, { ...DEFAULT_FILTERS, from: y.from, to: y.to }, todayISO(), m.from, m.to),
        fetchExpenses(db, DEFAULT_FILTERS),
        fetchIncomeSummary(db),
        fetchAccountsWithBalances(db).catch(() => null),
        fetchInvestments(db).catch(() => null),
      ]);

      const liquidCash = accResult?.accounts.length ? accResult.totalLiquidPaise : null;
      let invValue: number | null = null;
      let invNote: string | undefined;

      if (invResult?.holdings.length) {
        if (invResult.totalMarketValuePaise !== null) {
          invValue = invResult.totalMarketValuePaise;
        } else {
          invValue = invResult.totalInvestedPaise;
          invNote = "Cost basis (market prices unconfigured)";
        }
      } else if (invResult) {
        invValue = 0;
      }

      let netWorth: number | null = null;
      if (liquidCash !== null || invValue !== null) {
        netWorth = (liquidCash ?? 0) + (invValue ?? 0) + (accResult?.totalBrokeragePaise ?? 0);
      }

      setMetrics({
        todayExpense: yearSum.today,
        monthExpense: yearSum.month,
        yearExpense: yearSum.total,
        monthIncome: inc.month,
        yearIncome: inc.year,
        liquidCashPaise: liquidCash,
        investmentValuePaise: invValue,
        investmentNote: invNote,
        netWorthPaise: netWorth,
      });

      setRecent(list.rows.slice(0, 6));
    } catch (e) {
      setError(errorMessage(e, "Could not load your overview."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards: { label: string; value: string | null; note?: string; href?: string }[] = [
    { label: "Spent today", value: metrics && formatINR(metrics.todayExpense), href: "/expenses" },
    { label: "Spent this month", value: metrics && formatINR(metrics.monthExpense), href: "/expenses" },
    { label: "Spent this year", value: metrics && formatINR(metrics.yearExpense), href: "/reports" },
    { label: "Income this month", value: metrics && formatINR(metrics.monthIncome), href: "/income" },
    { label: "Income this year", value: metrics && formatINR(metrics.yearIncome), href: "/income" },
    {
      label: "Left this month (income − spent)",
      value: metrics && formatINR(metrics.monthIncome - metrics.monthExpense),
      href: "/monthly-trends",
    },
    {
      label: "Available cash & bank",
      value: metrics?.liquidCashPaise !== null && metrics?.liquidCashPaise !== undefined ? formatINR(metrics.liquidCashPaise) : null,
      note: metrics?.liquidCashPaise === null ? "No accounts added yet" : undefined,
      href: "/accounts",
    },
    {
      label: "Investment portfolio",
      value: metrics?.investmentValuePaise !== null && metrics?.investmentValuePaise !== undefined ? formatINR(metrics.investmentValuePaise) : null,
      note: metrics?.investmentNote || (metrics?.investmentValuePaise === null ? "No investments recorded" : undefined),
      href: "/investments",
    },
    {
      label: "Liquid net worth",
      value: metrics?.netWorthPaise !== null && metrics?.netWorthPaise !== undefined ? formatINR(metrics.netWorthPaise) : null,
      note: metrics?.netWorthPaise === null ? "Set up accounts & holdings" : "Cash + Demat + Holdings",
      href: "/accounts",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A real-time overview of your finances."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/accounts">
              <Button variant="secondary">
                <Landmark className="h-4 w-4" aria-hidden />
                Accounts
              </Button>
            </Link>
            <Link href="/income">
              <Button variant="secondary">
                <Plus className="h-4 w-4" aria-hidden />
                Add income
              </Button>
            </Link>
            <Link href="/expenses">
              <Button>
                <Plus className="h-4 w-4" aria-hidden />
                Add expense
              </Button>
            </Link>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error} <button className="underline" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="flex flex-col justify-between rounded-card border border-slate-200 bg-white p-3 md:p-4 shadow-sm">
            <div>
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
              {loading && !metrics ? (
                <Skeleton className="mt-2 h-6 w-24" />
              ) : c.value !== null ? (
                <p className="num mt-1 text-lg font-bold text-slate-900 md:text-xl">{c.value}</p>
              ) : (
                <p className="mt-1 text-sm text-slate-400">{c.note ?? "—"}</p>
              )}
            </div>
            {c.href && (
              <div className="mt-2 text-right">
                <Link href={c.href} className="text-[11px] font-medium text-brand-700 hover:underline">
                  View →
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">Recent Transactions</h2>
        <Link href="/expenses" className="text-xs font-medium text-brand-700 hover:underline">
          View all expenses →
        </Link>
      </div>

      {!loading && recent.length === 0 && !error ? (
        <EmptyState
          title="No expenses yet"
          body="Add an expense or import a statement and it will show up here."
          action={
            <Link href="/expenses">
              <Button>Go to Expenses</Button>
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-card border border-slate-200 bg-white shadow-sm">
          {loading && recent.length === 0 ? (
            <li className="p-4"><Skeleton className="h-10" /></li>
          ) : (
            recent.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 p-3 md:p-4 hover:bg-slate-50 transition-colors">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{e.title}</p>
                  <p className="text-xs text-slate-500">
                    {e.category?.name ?? "—"} · {displayDate(e.occurred_on)}
                    {e.account?.name ? ` · ${e.account.name}` : ""}
                  </p>
                </div>
                <p className="num shrink-0 text-sm font-bold text-red-600">{formatINR(e.amount_paise)}</p>
              </li>
            ))
          )}
        </ul>
      )}
    </>
  );
}
