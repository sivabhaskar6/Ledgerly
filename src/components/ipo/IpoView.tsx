"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Activity,
  Award,
  Rocket,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  IndianRupee,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchIpoGains,
  deleteIpoGain,
  type IpoSummary,
} from "@/lib/data/ipo";
import { fetchAccounts } from "@/lib/data/accounts";
import { errorMessage } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { displayDate, todayISO, presetRange } from "@/lib/utils/dates";
import type { Account, IpoGainWithRefs } from "@/types/db";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { IpoFormModal } from "./IpoFormModal";

export function IpoView() {
  const { notify } = useToast();
  const [data, setData] = useState<IpoSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form & Delete State
  const [formOpen, setFormOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<IpoGainWithRefs | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IpoGainWithRefs | null>(null);

  // Filter State
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const [res, accs] = await Promise.all([
        fetchIpoGains(db),
        fetchAccounts(db).catch(() => []),
      ]);
      setData(res);
      setAccounts(accs);
    } catch (e) {
      setError(errorMessage(e, "Could not load IPO listing gains."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const db = createClient();
      await deleteIpoGain(db, deleteTarget.id);
      notify("success", "IPO listing entry moved to Recently deleted.");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      notify("error", errorMessage(e, "Could not delete IPO listing entry."));
    }
  }

  // Filtered trades
  const filteredTrades = useMemo(() => {
    if (!data?.trades) return [];
    const today = todayISO();

    return data.trades.filter((t) => {
      // Search by symbol, name, or note
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesSymbol = t.symbol.toLowerCase().includes(q);
        const matchesName = t.name ? t.name.toLowerCase().includes(q) : false;
        const matchesNote = t.note ? t.note.toLowerCase().includes(q) : false;
        if (!matchesSymbol && !matchesName && !matchesNote) return false;
      }

      // Outcome filter
      if (outcomeFilter === "profit" && t.net_pnl_paise <= 0) return false;
      if (outcomeFilter === "loss" && t.net_pnl_paise >= 0) return false;

      // Date filter
      if (dateFilter === "today" && t.occurred_on !== today) return false;
      if (dateFilter === "week") {
        const w = presetRange("week");
        if (t.occurred_on < w.from || t.occurred_on > w.to) return false;
      }
      if (dateFilter === "month") {
        const m = presetRange("month");
        if (t.occurred_on < m.from || t.occurred_on > m.to) return false;
      }
      if (dateFilter === "year") {
        const y = presetRange("year");
        if (t.occurred_on < y.from || t.occurred_on > y.to) return false;
      }

      return true;
    });
  }, [data?.trades, search, outcomeFilter, dateFilter]);

  // Derived KPI metrics that dynamically reflect the active filters
  const kpiMetrics = useMemo(() => {
    const today = todayISO();
    if (!filteredTrades || filteredTrades.length === 0) {
      return {
        totalNetPnlPaise: 0,
        todayNetPnlPaise: 0,
        todayCount: 0,
        winRatePct: null as number | null,
        profitableCount: 0,
        totalCount: 0,
        totalInvestedPaise: 0,
        totalSoldPaise: 0,
        totalChargesPaise: 0,
      };
    }
    let net = 0;
    let todayNet = 0;
    let todayCount = 0;
    let profitable = 0;
    let invested = 0;
    let sold = 0;
    let charges = 0;

    for (const t of filteredTrades) {
      net += t.net_pnl_paise;
      charges += t.charges_paise;
      invested += t.issue_price_paise * t.quantity;
      sold += t.sold_price_paise * t.quantity;
      if (t.net_pnl_paise > 0) profitable++;
      if (t.occurred_on === today) {
        todayNet += t.net_pnl_paise;
        todayCount++;
      }
    }

    const winRatePct =
      filteredTrades.length > 0
        ? Math.round((profitable / filteredTrades.length) * 1000) / 10
        : null;

    return {
      totalNetPnlPaise: net,
      todayNetPnlPaise: todayNet,
      todayCount,
      winRatePct,
      profitableCount: profitable,
      totalCount: filteredTrades.length,
      totalInvestedPaise: invested,
      totalSoldPaise: sold,
      totalChargesPaise: charges,
    };
  }, [filteredTrades]);

  const totalNet = kpiMetrics.totalNetPnlPaise;
  const isTotalNetPos = totalNet >= 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header Bar */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">IPO Listing Gains</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Track IPO applications, allotment issue prices, sold listing day prices, and realized listing gains or discounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/income"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-200 hover:text-slate-900 transition"
          >
            <IndianRupee className="h-3.5 w-3.5 text-slate-600" />
            <span>View Income</span>
          </Link>
          <Button
            onClick={() => {
              setEditingTrade(null);
              setFormOpen(true);
            }}
            className="h-9 px-3.5 text-xs font-semibold shadow-xs"
          >
            <Rocket className="h-4 w-4 mr-1.5" aria-hidden />
            Record IPO gain
          </Button>
        </div>
      </div>

      {/* Migration Notice if Remote Database does not have ipo_gains table yet */}
      {data?.tableMissing && (
        <div className="mb-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 shrink-0">
          <p className="font-semibold text-amber-950">Database Setup Required</p>
          <p className="mt-0.5 text-amber-800">
            The <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">public.ipo_gains</code> table has not been created in your Supabase database yet. Please run migration{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">0008_ipo_gains.sql</code> in your Supabase SQL Editor to enable IPO listing gains tracking.
          </p>
        </div>
      )}

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

      {/* KPI Cards Grid */}
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 shrink-0">
        {/* Total Net Realized P&L */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Net Listing Gain</span>
            {loading ? null : isTotalNetPos ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
            )}
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <p
              className={`num mt-0.5 text-lg font-bold md:text-xl ${
                isTotalNetPos ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {isTotalNetPos ? `+${formatINR(totalNet)}` : formatINR(totalNet)}
            </p>
          )}
          <p className="text-[10px] text-slate-400 truncate">Synced to Income</p>
        </div>

        {/* Today Net P&L */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Today&apos;s Gain</span>
            <Activity className="h-3.5 w-3.5 text-slate-400" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <p
              className={`num mt-0.5 text-lg font-bold md:text-xl ${
                kpiMetrics.todayNetPnlPaise >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {kpiMetrics.todayNetPnlPaise >= 0
                ? `+${formatINR(kpiMetrics.todayNetPnlPaise)}`
                : formatINR(kpiMetrics.todayNetPnlPaise)}
            </p>
          )}
          <p className="text-[10px] text-slate-400 truncate">
            {kpiMetrics.todayCount} listed today
          </p>
        </div>

        {/* Win Rate */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Success Rate</span>
            <Award className="h-3.5 w-3.5 text-amber-500" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-16" />
          ) : (
            <p className="num mt-0.5 text-lg font-bold text-slate-900 md:text-xl">
              {kpiMetrics.winRatePct !== null && kpiMetrics.winRatePct !== undefined
                ? `${kpiMetrics.winRatePct}%`
                : "—"}
            </p>
          )}
          <p className="text-[10px] text-slate-400 truncate">
            {kpiMetrics.profitableCount}W / {kpiMetrics.totalCount} total
          </p>
        </div>

        {/* Total Capital Invested */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Capital Invested</span>
            <ArrowDownRight className="h-3.5 w-3.5 text-slate-400" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <p className="num mt-0.5 text-lg font-bold text-slate-900 md:text-xl">
              {formatINR(kpiMetrics.totalInvestedPaise)}
            </p>
          )}
          <p className="text-[10px] text-slate-400 truncate">Issue allotment cost</p>
        </div>

        {/* Total Realized / Sold */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Total Realized</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <p className="num mt-0.5 text-lg font-bold text-slate-900 md:text-xl">
              {formatINR(kpiMetrics.totalSoldPaise)}
            </p>
          )}
          <p className="text-[10px] text-slate-400 truncate">Listing sale value</p>
        </div>

        {/* Total Charges */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Charges & Taxes</span>
            <TrendingDown className="h-3.5 w-3.5 text-slate-400" />
          </div>
          {loading ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <p className="num mt-0.5 text-lg font-bold text-slate-700 md:text-xl">
              {formatINR(kpiMetrics.totalChargesPaise)}
            </p>
          )}
          <p className="text-[10px] text-slate-400 truncate">STT, Brokerage & GST</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xs shrink-0">
        <div className="relative min-w-[14rem] flex-1 flex items-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company or symbol (e.g. TATATECH)..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs md:text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {/* Outcome Filter */}
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none transition-colors cursor-pointer"
          >
            <option value="all">All Outcomes</option>
            <option value="profit">Profit Only</option>
            <option value="loss">Discount / Loss Only</option>
          </select>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none transition-colors cursor-pointer"
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </div>

      {/* Table & Footer */}
      <div className="flex-1 min-h-0 flex flex-col">
        {loading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : filteredTrades.length === 0 ? (
          <EmptyState
            title={search || outcomeFilter !== "all" || dateFilter !== "all" ? "No matching IPO listing entries" : "No IPO listing entries yet"}
            body="Record your IPO allotment issue price and sold listing price to track profits and losses synced directly with Income."
            action={
              <Button
                onClick={() => {
                  setEditingTrade(null);
                  setFormOpen(true);
                }}
                className="h-9 px-3.5 text-xs font-semibold shadow-xs"
              >
                <Rocket className="h-4 w-4 mr-1.5" aria-hidden />
                Record your first IPO gain
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-card border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Company / IPO</th>
                    <th className="px-4 py-2">Allotted Qty</th>
                    <th className="px-4 py-2">Issue Price</th>
                    <th className="px-4 py-2">Sold Price</th>
                    <th className="px-4 py-2">Invested / Realized</th>
                    <th className="px-4 py-2">Charges</th>
                    <th className="px-4 py-2 text-right">Net Listing P&L</th>
                    <th className="px-4 py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTrades.map((t) => {
                    const isProfit = t.net_pnl_paise >= 0;
                    const invested = t.issue_price_paise * t.quantity;
                    const sold = t.sold_price_paise * t.quantity;
                    const roi = invested > 0 ? Math.round((t.net_pnl_paise / invested) * 1000) / 10 : 0;

                    return (
                      <tr key={t.id} className="transition hover:bg-slate-50/70">
                        <td className="num whitespace-nowrap px-4 py-2 text-slate-600">
                          {displayDate(t.occurred_on)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{t.symbol}</span>
                            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.2 text-[10px] font-semibold text-blue-700">
                              IPO
                            </span>
                          </div>
                          {t.name && (
                            <p className="truncate text-[11px] text-slate-500 max-w-[180px]">{t.name}</p>
                          )}
                          {t.account?.name && (
                            <p className="text-[10px] text-slate-400">Acc: {t.account.name}</p>
                          )}
                        </td>
                        <td className="num whitespace-nowrap px-4 py-2 font-semibold text-slate-800">
                          {t.quantity} shares
                        </td>
                        <td className="num whitespace-nowrap px-4 py-2 font-mono text-slate-700">
                          ₹{(t.issue_price_paise / 100).toFixed(2)}
                        </td>
                        <td className="num whitespace-nowrap px-4 py-2 font-mono font-medium text-slate-900">
                          ₹{(t.sold_price_paise / 100).toFixed(2)}
                        </td>
                        <td className="num whitespace-nowrap px-4 py-2 text-[11px] text-slate-600">
                          <p>Inv: {formatINR(invested)}</p>
                          <p className="font-medium text-slate-900">Got: {formatINR(sold)}</p>
                        </td>
                        <td className="num whitespace-nowrap px-4 py-2 text-slate-500">
                          {t.charges_paise > 0 ? formatINR(t.charges_paise) : "₹0"}
                        </td>
                        <td className="num whitespace-nowrap px-4 py-2 text-right">
                          <span
                            className={`num inline-block font-bold text-xs md:text-sm ${
                              isProfit ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {isProfit
                              ? `+${formatINR(t.net_pnl_paise)}`
                              : formatINR(t.net_pnl_paise)}
                          </span>
                          <p
                            className={`text-[10px] font-semibold ${
                              isProfit ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {isProfit ? `+${roi}% pop` : `${roi}% discount`}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              aria-label={`Edit ${t.symbol}`}
                              onClick={() => {
                                setEditingTrade(t);
                                setFormOpen(true);
                              }}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${t.symbol}`}
                              onClick={() => setDeleteTarget(t)}
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pinned Bottom Footer - ALWAYS FULLY VISIBLE */}
            <div className="shrink-0 mt-2 flex items-center justify-between text-xs text-slate-500 px-1">
              <span>
                Showing {filteredTrades.length} of {data?.trades.length ?? 0} entries
              </span>
              <span className="text-[11px] text-slate-400">
                ⚡ Deleting moves to Recently deleted and automatically syncs with Income
              </span>
            </div>
          </>
        )}
      </div>

      {/* Form Modal */}
      <IpoFormModal
        open={formOpen}
        trade={editingTrade}
        accounts={accounts}
        onClose={() => {
          setFormOpen(false);
          setEditingTrade(null);
        }}
        onSaved={() => void load()}
        notify={notify}
      />

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Move IPO listing entry to Recently deleted?"
        body={`This will move the ${deleteTarget?.symbol} entry to Recently deleted and deduct/adjust its net P&L from your Income records.`}
        confirmLabel="Move to trash"
        tone="danger"
      />
    </div>
  );
}
