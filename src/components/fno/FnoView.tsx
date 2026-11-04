"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Activity,
  Award,
  Receipt,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  IndianRupee,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchFnoTrades,
  deleteFnoTrade,
  type FnoSummary,
} from "@/lib/data/fno";
import { fetchAccounts } from "@/lib/data/accounts";
import { errorMessage } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { displayDate, todayISO } from "@/lib/utils/dates";
import type { Account, FnoTradeWithRefs } from "@/types/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { FnoFormModal } from "./FnoFormModal";

export function FnoView() {
  const { notify } = useToast();
  const [data, setData] = useState<FnoSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form & Delete State
  const [formOpen, setFormOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<FnoTradeWithRefs | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FnoTradeWithRefs | null>(null);

  // Filter State
  const [search, setSearch] = useState("");
  const [instrumentFilter, setInstrumentFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const [res, accs] = await Promise.all([
        fetchFnoTrades(db),
        fetchAccounts(db).catch(() => []),
      ]);
      setData(res);
      setAccounts(accs);
    } catch (e) {
      setError(errorMessage(e, "Could not load F&O trades."));
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
      await deleteFnoTrade(db, deleteTarget.id);
      notify("success", "F&O trade deleted.");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      notify("error", errorMessage(e, "Could not delete F&O trade."));
    }
  }

  // Filtered trades
  const filteredTrades = useMemo(() => {
    if (!data?.trades) return [];
    const today = todayISO();

    return data.trades.filter((t) => {
      // Search by symbol or note
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const strikeStr = t.strike_price_paise
          ? String(Math.floor(t.strike_price_paise / 100))
          : "";
        const match =
          t.symbol.toLowerCase().includes(q) ||
          strikeStr.includes(q) ||
          (t.note && t.note.toLowerCase().includes(q));
        if (!match) return false;
      }

      // Filter by instrument
      if (instrumentFilter !== "all" && t.instrument_type !== instrumentFilter) {
        return false;
      }

      // Filter by outcome
      if (outcomeFilter === "profit" && t.net_pnl_paise <= 0) return false;
      if (outcomeFilter === "loss" && t.net_pnl_paise >= 0) return false;

      // Filter by date
      if (dateFilter === "today" && t.occurred_on !== today) return false;

      return true;
    });
  }, [data?.trades, search, instrumentFilter, outcomeFilter, dateFilter]);

  return (
    <>
      <PageHeader
        title="F&O Trading"
        description="Daily trading journal for Futures & Options with Call/Put tracking, bought & sold prices, charges, and profit/loss."
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
              <Plus className="h-4 w-4" aria-hidden />
              Record F&O trade
            </Button>
          </div>
        }
      />

      {data?.tableMissing && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800"
        >
          <p className="font-semibold">Setup Required: Run Database Migration</p>
          <p className="mt-1">
            The <code className="rounded bg-amber-100 px-1 py-0.5 text-xs font-mono">fno_trades</code> table is not yet created in your Supabase project.
            Copy and paste the SQL from{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 text-xs font-mono">
              supabase/migrations/0006_fno_trades.sql
            </code>{" "}
            into your <strong>Supabase SQL Editor</strong> to enable F&O trade tracking.
          </p>
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

      {/* KPI Metric Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {/* Total Net P&L */}
        <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Net Realized P&L</p>
            {data?.totalNetPnlPaise !== undefined && data.totalNetPnlPaise >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-600" />
            )}
          </div>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : data ? (
            <p
              className={`num mt-1 text-xl font-bold md:text-2xl ${
                data.totalNetPnlPaise >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {data.totalNetPnlPaise >= 0
                ? `+${formatINR(data.totalNetPnlPaise)}`
                : formatINR(data.totalNetPnlPaise)}
            </p>
          ) : (
            <p className="num mt-1 text-lg font-semibold text-slate-400">—</p>
          )}
          <p className="mt-1 text-xs text-slate-400">After brokerage & charges</p>
        </div>

        {/* Today's Net P&L */}
        <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Today&apos;s P&L</p>
            <Activity className="h-4 w-4 text-brand-600" />
          </div>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : data ? (
            <p
              className={`num mt-1 text-xl font-bold md:text-2xl ${
                data.todayNetPnlPaise >= 0 ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {data.todayNetPnlPaise >= 0
                ? `+${formatINR(data.todayNetPnlPaise)}`
                : formatINR(data.todayNetPnlPaise)}
            </p>
          ) : (
            <p className="num mt-1 text-lg font-semibold text-slate-400">—</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {data?.todayTradesCount ?? 0} trade(s) logged today
          </p>
        </div>

        {/* Win Rate */}
        <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Win Rate</p>
            <Award className="h-4 w-4 text-amber-500" />
          </div>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : data?.winRatePct !== null && data?.winRatePct !== undefined ? (
            <p className="num mt-1 text-xl font-bold text-amber-600 md:text-2xl">
              {data.winRatePct}%
            </p>
          ) : (
            <p className="num mt-1 text-lg font-semibold text-slate-400">—</p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {data?.winTrades ?? 0}W / {data?.lossTrades ?? 0}L
          </p>
        </div>

        {/* Total Charges Paid */}
        <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500">Total Charges</p>
            <Receipt className="h-4 w-4 text-slate-400" />
          </div>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : data ? (
            <p className="num mt-1 text-xl font-bold text-slate-800 md:text-2xl">
              {formatINR(data.totalChargesPaise)}
            </p>
          ) : (
            <p className="num mt-1 text-lg font-semibold text-slate-400">—</p>
          )}
          <p className="mt-1 text-xs text-slate-400">Brokerage & taxes</p>
        </div>

        {/* Total Trades */}
        <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Total Trades</p>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p className="num mt-1 text-xl font-bold text-slate-900 md:text-2xl">
              {data?.totalTrades ?? 0}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">Completed trades</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search symbol, strike, or note..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm focus:border-brand-500 focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 font-medium text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            Filter:
          </span>

          {/* Instrument Filter */}
          <select
            value={instrumentFilter}
            onChange={(e) => setInstrumentFilter(e.target.value)}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none"
          >
            <option value="all">All Instruments</option>
            <option value="call">Call (CE)</option>
            <option value="put">Put (PE)</option>
            <option value="future">Futures</option>
          </select>

          {/* Outcome Filter */}
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none"
          >
            <option value="all">All Outcomes</option>
            <option value="profit">Profitable Only</option>
            <option value="loss">Loss Only</option>
          </select>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none"
          >
            <option value="all">All Time</option>
            <option value="today">Today Only</option>
          </select>
        </div>
      </div>

      {/* Trades Journal Table */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Daily Trade Log</h2>

        {loading && (data?.trades.length ?? 0) === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (data?.trades.length ?? 0) === 0 && !error ? (
          <EmptyState
            title="No F&O trades recorded yet"
            body="Start tracking your daily futures & options trades with Call/Put options, bought and sold prices, charges, and exact profit/loss."
            action={
              <Button
                onClick={() => {
                  setEditingTrade(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden />
                Record first F&O trade
              </Button>
            }
          />
        ) : filteredTrades.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No trades match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-card border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Instrument</th>
                  <th className="px-4 py-3 text-right font-medium">Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Buy Price</th>
                  <th className="px-4 py-3 text-right font-medium">Sell Price</th>
                  <th className="px-4 py-3 text-right font-medium">Charges</th>
                  <th className="px-4 py-3 text-right font-medium">Gross P&L</th>
                  <th className="px-4 py-3 text-right font-medium">Net P&L</th>
                  <th className="px-4 py-3 font-medium">Note / Account</th>
                  <th className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTrades.map((t) => {
                  const isProfit = t.net_pnl_paise > 0;
                  const isLoss = t.net_pnl_paise < 0;
                  const investedPaise = t.buy_price_paise * t.quantity;
                  const roiPct =
                    investedPaise > 0
                      ? Math.round((t.net_pnl_paise / investedPaise) * 1000) / 10
                      : null;

                  return (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="num whitespace-nowrap px-4 py-3 text-slate-600">
                        {displayDate(t.occurred_on)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${
                              t.instrument_type === "call"
                                ? "bg-emerald-100 text-emerald-800"
                                : t.instrument_type === "put"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {t.instrument_type === "call" && (
                              <ArrowUpRight className="h-3 w-3" />
                            )}
                            {t.instrument_type === "put" && (
                              <ArrowDownRight className="h-3 w-3" />
                            )}
                            {t.instrument_type === "call"
                              ? "CE"
                              : t.instrument_type === "put"
                              ? "PE"
                              : "FUT"}
                          </span>
                          <div>
                            <span className="font-bold text-slate-900">{t.symbol}</span>
                            {t.strike_price_paise && (
                              <span className="num ml-1 font-semibold text-slate-700">
                                {Math.floor(t.strike_price_paise / 100)}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="num whitespace-nowrap px-4 py-3 text-right font-medium text-slate-700">
                        {t.quantity}
                      </td>

                      <td className="num whitespace-nowrap px-4 py-3 text-right text-slate-600">
                        {formatINR(t.buy_price_paise)}
                      </td>

                      <td className="num whitespace-nowrap px-4 py-3 text-right text-slate-600">
                        {formatINR(t.sell_price_paise)}
                      </td>

                      <td className="num whitespace-nowrap px-4 py-3 text-right text-slate-500">
                        {t.charges_paise > 0 ? `-${formatINR(t.charges_paise)}` : "₹0.00"}
                      </td>

                      <td className="num whitespace-nowrap px-4 py-3 text-right text-slate-600">
                        {t.gross_pnl_paise >= 0
                          ? `+${formatINR(t.gross_pnl_paise)}`
                          : formatINR(t.gross_pnl_paise)}
                      </td>

                      <td className="num whitespace-nowrap px-4 py-3 text-right">
                        <div
                          className={`inline-flex items-center gap-1 font-bold ${
                            isProfit
                              ? "text-emerald-700"
                              : isLoss
                              ? "text-rose-700"
                              : "text-slate-700"
                          }`}
                        >
                          {isProfit
                            ? `+${formatINR(t.net_pnl_paise)}`
                            : formatINR(t.net_pnl_paise)}
                        </div>
                        {roiPct !== null && (
                          <div
                            className={`num text-[11px] font-medium ${
                              roiPct > 0
                                ? "text-emerald-600"
                                : roiPct < 0
                                ? "text-rose-600"
                                : "text-slate-400"
                            }`}
                          >
                            {roiPct > 0 ? `+${roiPct}%` : `${roiPct}%`}
                          </div>
                        )}
                      </td>

                      <td className="max-w-[14rem] truncate px-4 py-3 text-xs text-slate-500">
                        <div>{t.note || "—"}</div>
                        {t.account?.name && (
                          <span className="text-[11px] text-slate-400">
                            via {t.account.name}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingTrade(t);
                              setFormOpen(true);
                            }}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                            aria-label={`Edit trade for ${t.symbol}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(t)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                            aria-label={`Delete trade for ${t.symbol}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FnoFormModal
        open={formOpen}
        trade={editingTrade}
        accounts={accounts}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load()}
        notify={notify}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete F&O trade?"
        body={
          deleteTarget
            ? `The trade record for ${deleteTarget.symbol} ${
                deleteTarget.strike_price_paise
                  ? `${Math.floor(deleteTarget.strike_price_paise / 100)} ${deleteTarget.instrument_type.toUpperCase()}`
                  : deleteTarget.instrument_type.toUpperCase()
              } on ${displayDate(deleteTarget.occurred_on)} with P&L of ${formatINR(
                deleteTarget.net_pnl_paise
              )} will be permanently removed.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}
