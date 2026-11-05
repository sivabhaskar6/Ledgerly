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
import { displayDate, todayISO } from "@/lib/utils/dates";
import type { Account, IpoGainWithRefs } from "@/types/db";
import { PageHeader } from "@/components/layout/PageHeader";
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
      if (dateFilter === "month") {
        const [currY, currM] = today.split("-");
        const [tradeY, tradeM] = t.occurred_on.split("-");
        if (currY !== tradeY || currM !== tradeM) return false;
      }
      if (dateFilter === "year") {
        const currY = today.split("-")[0];
        const tradeY = t.occurred_on.split("-")[0];
        if (currY !== tradeY) return false;
      }

      return true;
    });
  }, [data?.trades, search, outcomeFilter, dateFilter]);

  const totalNet = data?.totalNetPnlPaise ?? 0;
  const isTotalNetPos = totalNet >= 0;

  return (
    <>
      <PageHeader
        title="IPO Listing Gains"
        description="Track IPO allotment issue prices, listing sold prices, net listing profits, and discount losses synced directly to Income."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/income">
              <Button variant="secondary">
                <IndianRupee className="h-4 w-4" aria-hidden />
                View Income
              </Button>
            </Link>
            <Button
              onClick={() => {
                setEditingTrade(null);
                setFormOpen(true);
              }}
            >
              <Rocket className="h-4 w-4 mr-1.5" aria-hidden />
              Record IPO gain
            </Button>
          </div>
        }
      />

      {/* Migration Notice if Remote Database does not have ipo_gains table yet */}
      {data?.tableMissing && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <Rocket className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-amber-950">Database Setup Required</p>
              <p className="mt-1 text-amber-800">
                The <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">public.ipo_gains</code> table has not been created in your Supabase database yet. Please run migration{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">0008_ipo_gains.sql</code> in your Supabase SQL Editor to enable IPO listing gains tracking.
              </p>
            </div>
          </div>
        </div>
      )}

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

      {/* KPI Cards Grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {/* Total Net Realized P&L */}
        <div className="col-span-2 rounded-card border border-slate-200 bg-white p-3.5 shadow-sm md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Net Listing Gain</span>
            {loading ? null : isTotalNetPos ? (
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-600" />
            )}
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : (
            <p
              className={`num mt-1 text-xl font-bold md:text-2xl ${
                isTotalNetPos ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {isTotalNetPos ? `+${formatINR(totalNet)}` : formatINR(totalNet)}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-400">Synced to your Income</p>
        </div>

        {/* Today Net P&L */}
        <div className="rounded-card border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Today&apos;s Gain</span>
            <Activity className="h-4 w-4 text-slate-400" />
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <p
              className={`num mt-1 text-lg font-bold md:text-xl ${
                (data?.todayNetPnlPaise ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {(data?.todayNetPnlPaise ?? 0) >= 0
                ? `+${formatINR(data?.todayNetPnlPaise ?? 0)}`
                : formatINR(data?.todayNetPnlPaise ?? 0)}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-400">
            {data?.todayIposCount ?? 0} listed today
          </p>
        </div>

        {/* Win Rate / Successful listings */}
        <div className="rounded-card border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Success Rate</span>
            <Award className="h-4 w-4 text-amber-500" />
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p className="num mt-1 text-lg font-bold text-slate-900 md:text-xl">
              {data?.winRatePct !== null && data?.winRatePct !== undefined
                ? `${data.winRatePct}%`
                : "—"}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-400">
            {data?.profitableIpos ?? 0} profitable / {data?.totalIpos ?? 0} total
          </p>
        </div>

        {/* Total Capital Invested */}
        <div className="rounded-card border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Capital Invested</span>
            <ArrowDownRight className="h-4 w-4 text-slate-400" />
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <p className="num mt-1 text-lg font-bold text-slate-900 md:text-xl">
              {formatINR(data?.totalInvestedPaise ?? 0)}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-400">Issue allotment cost</p>
        </div>

        {/* Total Realized / Sold */}
        <div className="rounded-card border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Realized</span>
            <ArrowUpRight className="h-4 w-4 text-slate-400" />
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <p className="num mt-1 text-lg font-bold text-slate-900 md:text-xl">
              {formatINR(data?.totalSoldPaise ?? 0)}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-400">Listing sale value</p>
        </div>

        {/* Total Charges */}
        <div className="rounded-card border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Charges & Taxes</span>
            <TrendingDown className="h-4 w-4 text-slate-400" />
          </div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <p className="num mt-1 text-lg font-bold text-slate-700 md:text-xl">
              {formatINR(data?.totalChargesPaise ?? 0)}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-400">STT, Brokerage & GST</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 focus-within:border-brand-500 focus-within:bg-white">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company or symbol (e.g. TATATECH)..."
            className="w-full bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Outcome Filter */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
            <button
              type="button"
              onClick={() => setOutcomeFilter("all")}
              className={`rounded px-2 py-1 font-medium transition ${
                outcomeFilter === "all"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Outcomes
            </button>
            <button
              type="button"
              onClick={() => setOutcomeFilter("profit")}
              className={`rounded px-2 py-1 font-medium transition ${
                outcomeFilter === "profit"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Profit Only
            </button>
            <button
              type="button"
              onClick={() => setOutcomeFilter("loss")}
              className={`rounded px-2 py-1 font-medium transition ${
                outcomeFilter === "loss"
                  ? "bg-rose-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Discount / Loss Only
            </button>
          </div>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
        </div>
      </div>

      {/* Trades Table / List */}
      {loading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
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
            >
              <Rocket className="h-4 w-4 mr-1.5" aria-hidden />
              Record your first IPO gain
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Company / IPO</th>
                  <th className="px-4 py-3">Allotted Qty</th>
                  <th className="px-4 py-3">Issue Price</th>
                  <th className="px-4 py-3">Sold Price</th>
                  <th className="px-4 py-3">Invested / Realized</th>
                  <th className="px-4 py-3">Charges</th>
                  <th className="px-4 py-3 text-right">Net Listing P&L</th>
                  <th className="px-4 py-3 text-center">Actions</th>
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
                      {/* Date */}
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {displayDate(t.occurred_on)}
                      </td>

                      {/* Symbol & Company Name */}
                      <td className="px-4 py-3">
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

                      {/* Quantity */}
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800">
                        {t.quantity} shares
                      </td>

                      {/* Issue Price */}
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-slate-700">
                        ₹{(t.issue_price_paise / 100).toFixed(2)}
                      </td>

                      {/* Sold Price */}
                      <td className="whitespace-nowrap px-4 py-3 font-mono font-medium text-slate-900">
                        ₹{(t.sold_price_paise / 100).toFixed(2)}
                      </td>

                      {/* Invested vs Realized */}
                      <td className="whitespace-nowrap px-4 py-3 text-[11px] text-slate-600">
                        <p>Inv: {formatINR(invested)}</p>
                        <p className="font-medium text-slate-900">Got: {formatINR(sold)}</p>
                      </td>

                      {/* Charges */}
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {t.charges_paise > 0 ? formatINR(t.charges_paise) : "₹0"}
                      </td>

                      {/* Net Listing Gain */}
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span
                          className={`num inline-block font-bold text-sm ${
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

                      {/* Actions */}
                      <td className="whitespace-nowrap px-4 py-3 text-center">
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

          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-500">
            <span>
              Showing {filteredTrades.length} of {data?.trades.length ?? 0} entries
            </span>
            <span className="text-[11px] text-slate-400">
              ⚡ Deleting moves to Recently deleted and automatically syncs with Income
            </span>
          </div>
        </div>
      )}

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
    </>
  );
}
