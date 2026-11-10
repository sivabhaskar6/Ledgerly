"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Wallet,
  Calendar,
  TrendingUp,
  TrendingDown,
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
import { PageHeader } from "@/components/layout/PageHeader";
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
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Savings"
        description="Consolidated monthly savings after expenses, F&O trading, and IPO gains."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Year Filter */}
            {data && data.availableYears.length > 0 && (
              <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 text-xs">
                <button
                  onClick={() => setSelectedYear(null)}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${
                    selectedYear === null
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  All Years
                </button>
                {data.availableYears.map((yr) => (
                  <button
                    key={yr}
                    onClick={() => setSelectedYear(yr)}
                    className={`rounded-md px-2.5 py-1 font-medium transition ${
                      selectedYear === yr
                        ? "bg-slate-900 text-white"
                        : "text-slate-600 hover:bg-slate-100"
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
              className="h-8 gap-1.5 px-3 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. All-Time Cumulative Savings */}
          <div className="rounded-card border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Current Total Savings</span>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  data.allTimeSavingsPaise >= 0
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                <Wallet className="h-5 w-5" />
              </div>
            </div>
            <div
              className={`mt-2 text-2xl font-bold tracking-tight ${
                data.allTimeSavingsPaise >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {formatINR(data.allTimeSavingsPaise)}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              {data.allTimeSavingsPaise >= 0 ? (
                <span className="inline-flex items-center text-emerald-600 font-medium">
                  <TrendingUp className="mr-0.5 h-3.5 w-3.5" /> Net Surplus
                </span>
              ) : (
                <span className="inline-flex items-center text-rose-600 font-medium">
                  <TrendingDown className="mr-0.5 h-3.5 w-3.5" /> Net Deficit
                </span>
              )}
              <span>• Total accumulated till now</span>
            </div>
          </div>

          {/* 2. This Month's Savings */}
          <div className="rounded-card border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">This Month&apos;s Savings</span>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  data.currentMonthSavingsPaise >= 0
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                <Calendar className="h-5 w-5" />
              </div>
            </div>
            <div
              className={`mt-2 text-2xl font-bold tracking-tight ${
                data.currentMonthSavingsPaise >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {formatINR(data.currentMonthSavingsPaise)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Income − Expenses ± F&O & IPO
            </div>
          </div>

          {/* 3. Current Year (YTD) Savings */}
          <div className="rounded-card border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">{currentYear} YTD Savings</span>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  data.currentYearSavingsPaise >= 0
                    ? "bg-brand-50 text-brand-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div
              className={`mt-2 text-2xl font-bold tracking-tight ${
                data.currentYearSavingsPaise >= 0 ? "text-slate-900" : "text-rose-700"
              }`}
            >
              {formatINR(data.currentYearSavingsPaise)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Cumulative saved in {currentYear}
            </div>
          </div>

          {/* 4. Overall Inflow vs Outflow */}
          <div className="rounded-card border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">All-Time Expenses</span>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Receipt className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              {formatINR(data.allTimeExpensePaise)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Total lifetime expenses minimized
            </div>
          </div>
        </div>
      ) : null}

      {/* Month-by-Month Savings Ledger */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Monthly Savings Records
            </h2>
            <p className="text-xs text-slate-500">
              One record per entire month showing income, expenses, F&O trading, IPO gains, and cumulative savings.
            </p>
          </div>
        </div>

        {data && data.records.length === 0 ? (
          <div className="rounded-card border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
            <Wallet className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-900">No records found</h3>
            <p className="mt-1 text-xs text-slate-500">
              Add your income, expenses, or trades to start tracking your monthly savings.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data?.records.map((record) => {
              const isExpanded = Boolean(expandedMonths[record.monthKey]);
              const isPositive = record.netSavingsPaise >= 0;

              return (
                <div
                  key={record.monthKey}
                  className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-sm transition hover:border-slate-300"
                >
                  {/* Monthly Summary Bar */}
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-900">
                          {record.monthLabel}
                        </span>
                        {record.isCurrentMonth && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            Current Month
                          </span>
                        )}
                        {record.savingsRatePercent !== null && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            <Percent className="h-2.5 w-2.5" />
                            {record.savingsRatePercent}% saved
                          </span>
                        )}
                      </div>

                      {/* Net Result Badge & Running Balance */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Month's Net Savings Badge */}
                        <div
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                            isPositive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {isPositive ? (
                            <>
                              <ArrowUpRight className="h-3.5 w-3.5" />
                              {formatINR(record.netSavingsPaise)} Saved
                            </>
                          ) : (
                            <>
                              <ArrowDownRight className="h-3.5 w-3.5" />
                              {formatINR(record.netSavingsPaise)} Deficit
                            </>
                          )}
                        </div>

                        {/* Cumulative Savings Badge */}
                        <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                          <Wallet className="h-3 w-3 text-slate-500" />
                          <span>Till now:</span>
                          <span
                            className={`font-bold ${
                              record.cumulativeSavingsPaise >= 0
                                ? "text-emerald-700"
                                : "text-rose-700"
                            }`}
                          >
                            {formatINR(record.cumulativeSavingsPaise)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 4 Pillars Breakdown Grid */}
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {/* 1. Income */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <PiggyBank className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Regular Income</span>
                        </div>
                        <div className="mt-1 text-sm font-semibold text-emerald-700">
                          +{formatINR(record.regularIncomePaise)}
                        </div>
                      </div>

                      {/* 2. Expenses */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Receipt className="h-3.5 w-3.5 text-rose-600" />
                          <span>Expenses</span>
                        </div>
                        <div className="mt-1 text-sm font-semibold text-rose-700">
                          −{formatINR(record.expensePaise)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {record.expenseCount} transaction{record.expenseCount === 1 ? "" : "s"}
                        </div>
                      </div>

                      {/* 3. F&O Trading */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <CandlestickChart className="h-3.5 w-3.5 text-indigo-600" />
                          <span>F&O Trading</span>
                        </div>
                        <div
                          className={`mt-1 text-sm font-semibold ${
                            record.fnoPnlPaise > 0
                              ? "text-emerald-700"
                              : record.fnoPnlPaise < 0
                              ? "text-rose-700"
                              : "text-slate-600"
                          }`}
                        >
                          {record.fnoPnlPaise > 0 ? "+" : ""}
                          {formatINR(record.fnoPnlPaise)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {record.fnoTradeCount} trade{record.fnoTradeCount === 1 ? "" : "s"}
                        </div>
                      </div>

                      {/* 4. IPO Gains */}
                      <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Rocket className="h-3.5 w-3.5 text-purple-600" />
                          <span>IPO Listing</span>
                        </div>
                        <div
                          className={`mt-1 text-sm font-semibold ${
                            record.ipoPnlPaise > 0
                              ? "text-emerald-700"
                              : record.ipoPnlPaise < 0
                              ? "text-rose-700"
                              : "text-slate-600"
                          }`}
                        >
                          {record.ipoPnlPaise > 0 ? "+" : ""}
                          {formatINR(record.ipoPnlPaise)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {record.ipoCount} allotment{record.ipoCount === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>

                    {/* Expand/Collapse Breakdown Footer */}
                    <div className="mt-3 flex items-center justify-between pt-2">
                      <div className="text-xs text-slate-500">
                        <span className="font-medium text-slate-700">Math: </span>
                        <span>
                          {formatINR(record.regularIncomePaise)} (Income) −{" "}
                          {formatINR(record.expensePaise)} (Expenses){" "}
                          {record.fnoPnlPaise >= 0 ? "+" : "−"}{" "}
                          {formatINR(Math.abs(record.fnoPnlPaise))} (F&O){" "}
                          {record.ipoPnlPaise >= 0 ? "+" : "−"}{" "}
                          {formatINR(Math.abs(record.ipoPnlPaise))} (IPO) ={" "}
                        </span>
                        <strong
                          className={
                            record.netSavingsPaise >= 0 ? "text-emerald-700" : "text-rose-700"
                          }
                        >
                          {formatINR(record.netSavingsPaise)}
                        </strong>
                      </div>

                      <button
                        onClick={() => toggleMonth(record.monthKey)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
                      >
                        {isExpanded ? (
                          <>
                            Hide Summary <ChevronUp className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            View Details <ChevronDown className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Breakdown Drawer */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5 text-xs">
                      <h4 className="font-semibold text-slate-800 mb-2">
                        {record.monthLabel} Detailed Financial Statement
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-slate-500 font-medium">Inflows & Profits</div>
                          <div className="flex justify-between py-1 border-b border-slate-100">
                            <span>Earned Income (Salary/Business):</span>
                            <span className="font-semibold text-emerald-700">
                              +{formatINR(record.regularIncomePaise)}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-100">
                            <span>F&O Trading Profits:</span>
                            <span
                              className={`font-semibold ${
                                record.fnoPnlPaise >= 0 ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {record.fnoPnlPaise >= 0 ? "+" : ""}
                              {formatINR(record.fnoPnlPaise)}
                            </span>
                          </div>
                          <div className="flex justify-between py-1">
                            <span>IPO Listing Gains:</span>
                            <span
                              className={`font-semibold ${
                                record.ipoPnlPaise >= 0 ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {record.ipoPnlPaise >= 0 ? "+" : ""}
                              {formatINR(record.ipoPnlPaise)}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3">
                          <div className="text-slate-500 font-medium">Outflows & Net Balance</div>
                          <div className="flex justify-between py-1 border-b border-slate-100">
                            <span>Total Expenses (Minimization):</span>
                            <span className="font-semibold text-rose-700">
                              −{formatINR(record.expensePaise)}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-100">
                            <span>Net Month Savings:</span>
                            <span
                              className={`font-bold ${
                                record.netSavingsPaise >= 0
                                  ? "text-emerald-700"
                                  : "text-rose-700"
                              }`}
                            >
                              {formatINR(record.netSavingsPaise)}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 bg-slate-50 px-2 rounded font-medium">
                            <span>Cumulative Savings Balance:</span>
                            <span
                              className={`font-bold ${
                                record.cumulativeSavingsPaise >= 0
                                  ? "text-emerald-700"
                                  : "text-rose-700"
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
