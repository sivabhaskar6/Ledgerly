"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Wallet,
  Calendar,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Receipt,
  PiggyBank,
  CandlestickChart,
  Rocket,
  ChevronDown,
  ChevronUp,
  Percent,
} from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/utils/money";
import {
  fetchSavingsSummary,
  type SavingsSummary,
} from "@/lib/data/savings";

export function SavingsView() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SavingsSummary | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const summary = await fetchSavingsSummary(createClient(), selectedYear ?? undefined);
      setData(summary);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const toggleMonth = (mKey: string) => {
    setExpandedMonths((prev) => ({ ...prev, [mKey]: !prev[mKey] }));
  };

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Top Header */}
      <div className="mb-2 sm:mb-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">Savings</h1>
          <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400">
            Consolidated monthly savings after expenses, F&O trading, and IPO gains.
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Year Filter */}
          {data && data.availableYears.length > 0 && (
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs shadow-xs dark:border-white/10 dark:bg-[#141414]">
              <button
                onClick={() => setSelectedYear(null)}
                className={`rounded-md px-2 py-0.5 font-medium transition ${
                  selectedYear === null
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/5"
                }`}
              >
                All Years
              </button>
              {data.availableYears.map((yr) => (
                <button
                  key={yr}
                  onClick={() => setSelectedYear(yr)}
                  className={`rounded-md px-2 py-0.5 font-medium transition ${
                    selectedYear === yr
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-white/5"
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          )}

          <Button
            variant="secondary"
            onClick={() => void loadData()}
            loading={loading}
            className="h-8 sm:h-9 px-2.5 sm:px-3 text-xs font-medium shadow-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-4 shrink-0">
        {/* 1. All-Time Cumulative Savings */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Current Total Savings</span>
            <Wallet className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
          </div>
          <div
            className={`num mt-0.5 text-base sm:text-lg font-bold md:text-xl ${
              (data?.allTimeSavingsPaise ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {loading && !data ? <Skeleton className="h-6 w-20" /> : formatINR(data?.allTimeSavingsPaise ?? 0)}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">Total accumulated till now</p>
        </div>

        {/* 2. This Month's Savings */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">This Month&apos;s Savings</span>
            <Calendar className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
          </div>
          <div
            className={`num mt-0.5 text-base sm:text-lg font-bold md:text-xl ${
              (data?.currentMonthSavingsPaise ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {loading && !data ? <Skeleton className="h-6 w-20" /> : formatINR(data?.currentMonthSavingsPaise ?? 0)}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">Income − Expenses ± F&O & IPO</p>
        </div>

        {/* 3. Current Year (YTD) Savings */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">{currentYear} YTD Savings</span>
            <TrendingUp className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
          </div>
          <div
            className={`num mt-0.5 text-base sm:text-lg font-bold md:text-xl ${
              (data?.currentYearSavingsPaise ?? 0) >= 0 ? "text-slate-900 dark:text-white" : "text-rose-700 dark:text-rose-400"
            }`}
          >
            {loading && !data ? <Skeleton className="h-6 w-20" /> : formatINR(data?.currentYearSavingsPaise ?? 0)}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">Cumulative saved in {currentYear}</p>
        </div>

        {/* 4. Overall Inflow vs Outflow */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">All-Time Expenses</span>
            <Receipt className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500" />
          </div>
          <div className="num mt-0.5 text-base sm:text-lg font-bold md:text-xl text-slate-900 dark:text-white">
            {loading && !data ? <Skeleton className="h-6 w-20" /> : formatINR(data?.allTimeExpensePaise ?? 0)}
          </div>
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">Total lifetime expenses</p>
        </div>
      </div>

      {/* Month-by-Month Savings Ledger */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="mb-1.5 flex items-center justify-between shrink-0">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
            Monthly Savings Records
          </h2>
          <p className="hidden sm:block text-[11px] text-slate-400 dark:text-zinc-500">
            One record per entire month showing income, expenses, F&O trading, IPO gains, and cumulative savings.
          </p>
        </div>

        {data && data.records.length === 0 ? (
          <div className="rounded-card border border-slate-200 bg-white p-8 sm:p-12 text-center text-slate-500 shadow-sm dark:border-white/10 dark:bg-[#141414]">
            <Wallet className="mx-auto h-10 w-10 sm:h-12 sm:w-12 text-slate-300 dark:text-zinc-600" />
            <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">No records found</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
              Add your income, expenses, or trades to start tracking your monthly savings.
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 sm:space-y-2.5 pr-1">
            {data?.records.map((record) => {
              const isExpanded = Boolean(expandedMonths[record.monthKey]);
              const isPositive = record.netSavingsPaise >= 0;

              return (
                <div
                  key={record.monthKey}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs transition hover:border-slate-300 dark:border-white/10 dark:bg-[#141414] dark:hover:border-white/20"
                >
                  {/* Monthly Summary Bar */}
                  <div className="p-2.5 sm:p-4">
                    {/* Header Row: Month Name, Badges & Net Result */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2.5 border-b border-slate-100 pb-2 sm:pb-2.5 dark:border-white/5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                          {record.monthLabel}
                        </span>
                        {record.isCurrentMonth && (
                          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                            Current Month
                          </span>
                        )}
                        {record.savingsRatePercent !== null && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                            <Percent className="h-2 w-2 sm:h-2.5 sm:w-2.5" />
                            {record.savingsRatePercent}% saved
                          </span>
                        )}
                      </div>

                      {/* Net Result Badge & Running Balance */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Month's Net Savings Badge */}
                        <div
                          className={`inline-flex items-center gap-1 rounded-full px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-semibold ${
                            isPositive
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400"
                          }`}
                        >
                          {isPositive ? (
                            <>
                              <ArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              {formatINR(record.netSavingsPaise)} Saved
                            </>
                          ) : (
                            <>
                              <ArrowDownRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                              {formatINR(record.netSavingsPaise)} Deficit
                            </>
                          )}
                        </div>

                        {/* Cumulative Savings Badge */}
                        <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-medium text-slate-700 dark:bg-zinc-800 dark:text-zinc-300">
                          <Wallet className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-slate-500 dark:text-zinc-400" />
                          <span className="hidden xs:inline">Till now:</span>
                          <span
                            className={`font-bold ${
                              record.cumulativeSavingsPaise >= 0
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-rose-700 dark:text-rose-400"
                            }`}
                          >
                            {formatINR(record.cumulativeSavingsPaise)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 4 Pillars Breakdown Grid */}
                    <div className="mt-2 sm:mt-3 grid grid-cols-2 gap-1.5 sm:gap-2.5 sm:grid-cols-4">
                      {/* 1. Income */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-1.5 sm:p-2.5 dark:border-white/5 dark:bg-[#181818]">
                        <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-500 dark:text-zinc-400">
                          <PiggyBank className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span className="truncate">Regular Income</span>
                        </div>
                        <div className="mt-0.5 text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                          +{formatINR(record.regularIncomePaise)}
                        </div>
                        <div className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500">
                          Salary & others
                        </div>
                      </div>

                      {/* 2. Expenses */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-1.5 sm:p-2.5 dark:border-white/5 dark:bg-[#181818]">
                        <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-500 dark:text-zinc-400">
                          <Receipt className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                          <span className="truncate">Expenses</span>
                        </div>
                        <div className="mt-0.5 text-xs sm:text-sm font-semibold text-rose-700 dark:text-rose-400">
                          −{formatINR(record.expensePaise)}
                        </div>
                        <div className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                          {record.expenseCount} txn{record.expenseCount === 1 ? "" : "s"}
                        </div>
                      </div>

                      {/* 3. F&O Trading */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-1.5 sm:p-2.5 dark:border-white/5 dark:bg-[#181818]">
                        <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-500 dark:text-zinc-400">
                          <CandlestickChart className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span className="truncate">F&O Trading</span>
                        </div>
                        <div
                          className={`mt-0.5 text-xs sm:text-sm font-semibold ${
                            record.fnoPnlPaise > 0
                              ? "text-emerald-700 dark:text-emerald-400"
                              : record.fnoPnlPaise < 0
                              ? "text-rose-700 dark:text-rose-400"
                              : "text-slate-600 dark:text-zinc-400"
                          }`}
                        >
                          {record.fnoPnlPaise > 0 ? "+" : ""}
                          {formatINR(record.fnoPnlPaise)}
                        </div>
                        <div className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                          {record.fnoTradeCount} trade{record.fnoTradeCount === 1 ? "" : "s"}
                        </div>
                      </div>

                      {/* 4. IPO Gains */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-1.5 sm:p-2.5 dark:border-white/5 dark:bg-[#181818]">
                        <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs text-slate-500 dark:text-zinc-400">
                          <Rocket className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                          <span className="truncate">IPO Listing</span>
                        </div>
                        <div
                          className={`mt-0.5 text-xs sm:text-sm font-semibold ${
                            record.ipoPnlPaise > 0
                              ? "text-emerald-700 dark:text-emerald-400"
                              : record.ipoPnlPaise < 0
                              ? "text-rose-700 dark:text-rose-400"
                              : "text-slate-600 dark:text-zinc-400"
                          }`}
                        >
                          {record.ipoPnlPaise > 0 ? "+" : ""}
                          {formatINR(record.ipoPnlPaise)}
                        </div>
                        <div className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                          {record.ipoCount} IPO{record.ipoCount === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>

                    {/* Expand/Collapse Breakdown Footer */}
                    <div className="mt-2 sm:mt-2.5 flex items-center justify-between pt-1.5 sm:pt-2 border-t border-slate-100 dark:border-white/5">
                      <div className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 truncate pr-2">
                        <span className="font-medium text-slate-700 dark:text-zinc-300">Net: </span>
                        <span className="hidden sm:inline">
                          {formatINR(record.regularIncomePaise)} (Income) −{" "}
                          {formatINR(record.expensePaise)} (Expenses){" "}
                          {record.fnoPnlPaise >= 0 ? "+" : "−"}{" "}
                          {formatINR(Math.abs(record.fnoPnlPaise))} (F&O){" "}
                          {record.ipoPnlPaise >= 0 ? "+" : "−"}{" "}
                          {formatINR(Math.abs(record.ipoPnlPaise))} (IPO) ={" "}
                        </span>
                        <strong
                          className={
                            record.netSavingsPaise >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                          }
                        >
                          {formatINR(record.netSavingsPaise)}
                        </strong>
                      </div>

                      <button
                        onClick={() => toggleMonth(record.monthKey)}
                        className="inline-flex items-center gap-0.5 text-[11px] sm:text-xs font-medium text-brand-700 hover:text-brand-800 dark:text-blue-400 dark:hover:text-blue-300 shrink-0"
                      >
                        {isExpanded ? (
                          <>
                            Hide <span className="hidden sm:inline">Summary</span> <ChevronUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          </>
                        ) : (
                          <>
                            Details <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Breakdown Drawer */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-2.5 sm:p-4 text-xs dark:border-white/5 dark:bg-[#181818]/50">
                      <h4 className="font-semibold text-slate-800 dark:text-zinc-200 mb-2">
                        {record.monthLabel} Detailed Financial Statement
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                        <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3 dark:border-white/10 dark:bg-[#141414]">
                          <div className="text-slate-500 dark:text-zinc-400 font-medium text-[11px] sm:text-xs">Inflows & Profits</div>
                          <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5 text-[11px] sm:text-xs">
                            <span className="text-slate-600 dark:text-zinc-400">Earned Income:</span>
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              +{formatINR(record.regularIncomePaise)}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5 text-[11px] sm:text-xs">
                            <span className="text-slate-600 dark:text-zinc-400">F&O Trading:</span>
                            <span
                              className={`font-semibold ${
                                record.fnoPnlPaise >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                              }`}
                            >
                              {record.fnoPnlPaise >= 0 ? "+" : ""}
                              {formatINR(record.fnoPnlPaise)}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 text-[11px] sm:text-xs">
                            <span className="text-slate-600 dark:text-zinc-400">IPO Listing Gains:</span>
                            <span
                              className={`font-semibold ${
                                record.ipoPnlPaise >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
                              }`}
                            >
                              {record.ipoPnlPaise >= 0 ? "+" : ""}
                              {formatINR(record.ipoPnlPaise)}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2.5 sm:p-3 dark:border-white/10 dark:bg-[#141414]">
                          <div className="text-slate-500 dark:text-zinc-400 font-medium text-[11px] sm:text-xs">Outflows & Net Balance</div>
                          <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5 text-[11px] sm:text-xs">
                            <span className="text-slate-600 dark:text-zinc-400">Total Expenses:</span>
                            <span className="font-semibold text-rose-700 dark:text-rose-400">
                              −{formatINR(record.expensePaise)}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-100 dark:border-white/5 text-[11px] sm:text-xs">
                            <span className="text-slate-600 dark:text-zinc-400">Net Month Savings:</span>
                            <span
                              className={`font-bold ${
                                record.netSavingsPaise >= 0
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-rose-700 dark:text-rose-400"
                              }`}
                            >
                              {formatINR(record.netSavingsPaise)}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 bg-slate-50 dark:bg-zinc-800/60 px-2 rounded font-medium text-[11px] sm:text-xs">
                            <span className="text-slate-700 dark:text-zinc-300">Cumulative Savings:</span>
                            <span
                              className={`font-bold ${
                                record.cumulativeSavingsPaise >= 0
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-rose-700 dark:text-rose-400"
                              }`}
                            >
                              {formatINR(record.cumulativeSavingsPaise)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
