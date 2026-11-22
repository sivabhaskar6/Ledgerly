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
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchFnoTrades,
  deleteFnoTrade,
  type FnoSummary,
} from "@/lib/data/fno";
import { resolveFnoSegment } from "@/lib/validations/fno";
import { fetchAccounts } from "@/lib/data/accounts";
import { errorMessage } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { displayDate, todayISO, presetRange } from "@/lib/utils/dates";
import type { Account, FnoTradeWithRefs } from "@/types/db";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { FnoFormModal } from "./FnoFormModal";
import { FnoContractNoteModal } from "./FnoContractNoteModal";

export function FnoView() {
  const { notify } = useToast();
  const [data, setData] = useState<FnoSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form & Delete State
  const [formOpen, setFormOpen] = useState(false);
  const [contractNoteModalOpen, setContractNoteModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<FnoTradeWithRefs | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FnoTradeWithRefs | null>(null);

  // Filter State
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [instrumentFilter, setInstrumentFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Available years extracted from trades
  const availableYears = useMemo(() => {
    if (!data?.trades || data.trades.length === 0) {
      return [new Date().getFullYear()];
    }
    const yearsSet = new Set<number>();
    yearsSet.add(new Date().getFullYear());
    for (const t of data.trades) {
      if (t.occurred_on) {
        const yr = parseInt(t.occurred_on.slice(0, 4), 10);
        if (!isNaN(yr)) yearsSet.add(yr);
      }
    }
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [data?.trades]);

  const handleSelectYear = (yr: number | null) => {
    setSelectedYear(yr);
    if (yr !== null && yr !== new Date().getFullYear()) {
      setDateFilter("all");
    }
  };

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
      notify("success", "F&O trade moved to Recently deleted.");
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

      // Filter by segment
      if (segmentFilter !== "all") {
        const seg = resolveFnoSegment(t.symbol, t.segment);
        if (seg !== segmentFilter) return false;
      }

      // Filter by instrument
      if (instrumentFilter !== "all" && t.instrument_type !== instrumentFilter) {
        return false;
      }

      // Filter by outcome
      if (outcomeFilter === "profit" && t.net_pnl_paise <= 0) return false;
      if (outcomeFilter === "loss" && t.net_pnl_paise >= 0) return false;

      // Filter by selected year
      if (selectedYear !== null) {
        if (!t.occurred_on.startsWith(String(selectedYear))) return false;
      }

      // Filter by date preset
      if (dateFilter === "today") {
        if (t.occurred_on !== today) return false;
      } else if (dateFilter === "week") {
        const w = presetRange("week");
        if (t.occurred_on < w.from || t.occurred_on > w.to) return false;
      } else if (dateFilter === "month") {
        const m = presetRange("month");
        if (t.occurred_on < m.from || t.occurred_on > m.to) return false;
      } else if (dateFilter === "year") {
        const y = presetRange("year");
        if (t.occurred_on < y.from || t.occurred_on > y.to) return false;
      } else if (dateFilter === "fy") {
        const fy = presetRange("fy");
        if (t.occurred_on < fy.from || t.occurred_on > fy.to) return false;
      }

      return true;
    });
  }, [data?.trades, search, segmentFilter, instrumentFilter, outcomeFilter, selectedYear, dateFilter]);

  // Derived KPI metrics that dynamically reflect the active filters
  const kpiMetrics = useMemo(() => {
    const today = todayISO();
    if (!filteredTrades) {
      return {
        netPnlPaise: 0,
        chargesPaise: 0,
        tradesCount: 0,
        winTrades: 0,
        lossTrades: 0,
        winRatePct: null as number | null,
        todayNetPnlPaise: 0,
        todayTradesCount: 0,
      };
    }

    let netPnl = 0;
    let charges = 0;
    let winCount = 0;
    let lossCount = 0;
    let todayPnl = 0;
    let todayCount = 0;

    for (const t of filteredTrades) {
      netPnl += t.net_pnl_paise;
      charges += t.charges_paise;
      if (t.net_pnl_paise > 0) winCount++;
      else if (t.net_pnl_paise < 0) lossCount++;

      if (t.occurred_on === today) {
        todayPnl += t.net_pnl_paise;
        todayCount++;
      }
    }

    const decisiveTrades = winCount + lossCount;
    const winRate = decisiveTrades > 0 ? Math.round((winCount / decisiveTrades) * 1000) / 10 : null;

    return {
      netPnlPaise: netPnl,
      chargesPaise: charges,
      tradesCount: filteredTrades.length,
      winTrades: winCount,
      lossTrades: lossCount,
      winRatePct: winRate,
      todayNetPnlPaise: todayPnl,
      todayTradesCount: todayCount,
    };
  }, [filteredTrades]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header Bar */}
      <div className="mb-2 sm:mb-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">F&O Trading</h1>
            {/* Year Switcher */}
            {availableYears.length > 0 && (
              <div className="filter-capsule">
                <button
                  type="button"
                  onClick={() => handleSelectYear(null)}
                  className={selectedYear === null ? "filter-pill-active" : "filter-pill-inactive"}
                >
                  All Years
                </button>
                {availableYears.map((yr) => (
                  <button
                    type="button"
                    key={yr}
                    onClick={() => handleSelectYear(yr)}
                    className={selectedYear === yr ? "filter-pill-active" : "filter-pill-inactive"}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400">
            Daily trading journal for Futures & Options with Call/Put tracking, bought & sold prices, charges, and profit/loss.
          </p>
        </div>

        {/* Actions on the right */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="secondary"
            onClick={() => setContractNoteModalOpen(true)}
            className="h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs font-semibold shadow-xs gap-1 sm:gap-1.5"
          >
            <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            <span><span className="hidden sm:inline">Upload </span>Contract Note</span>
          </Button>
          <Button
            onClick={() => {
              setEditingTrade(null);
              setFormOpen(true);
            }}
            className="h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs font-semibold shadow-xs"
          >
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
            Record trade
          </Button>
        </div>
      </div>

      {data?.tableMissing && (
        <div
          role="alert"
          className="mb-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 shrink-0"
        >
          <p className="font-semibold">Setup Required: Run Database Migration</p>
          <p className="mt-0.5">
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
          className="mb-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 shrink-0"
        >
          {error}{" "}
          <button className="underline" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      {/* KPI Metric Cards */}
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 shrink-0">
        {/* Total Net P&L */}
        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Net Realized P&L</p>
            {kpiMetrics.netPnlPaise >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
          </div>
          {loading && !data ? (
            <Skeleton className="mt-1 h-6 w-24" />
          ) : (
            <p
              className={`num mt-0.5 text-base sm:text-lg font-bold md:text-xl ${
                kpiMetrics.netPnlPaise >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
              }`}
            >
              {kpiMetrics.netPnlPaise >= 0
                ? `+${formatINR(kpiMetrics.netPnlPaise)}`
                : formatINR(kpiMetrics.netPnlPaise)}
            </p>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">After brokerage & charges</p>
        </div>

        {/* Today's Net P&L */}
        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Today&apos;s P&L</p>
            <Activity className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400 shrink-0" />
          </div>
          {loading && !data ? (
            <Skeleton className="mt-1 h-6 w-24" />
          ) : (
            <p
              className={`num mt-0.5 text-base sm:text-lg font-bold md:text-xl ${
                kpiMetrics.todayNetPnlPaise >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
              }`}
            >
              {kpiMetrics.todayNetPnlPaise >= 0
                ? `+${formatINR(kpiMetrics.todayNetPnlPaise)}`
                : formatINR(kpiMetrics.todayNetPnlPaise)}
            </p>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">
            {kpiMetrics.todayTradesCount} trade(s) today
          </p>
        </div>

        {/* Win Rate */}
        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Win Rate</p>
            <Award className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          </div>
          {loading && !data ? (
            <Skeleton className="mt-1 h-6 w-16" />
          ) : kpiMetrics.winRatePct !== null ? (
            <p className="num mt-0.5 text-base sm:text-lg font-bold text-amber-600 md:text-xl dark:text-amber-400">
              {kpiMetrics.winRatePct}%
            </p>
          ) : (
            <p className="num mt-0.5 text-base sm:text-lg font-semibold text-slate-400">—</p>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">
            {kpiMetrics.winTrades}W / {kpiMetrics.lossTrades}L
          </p>
        </div>

        {/* Total Charges Paid */}
        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Total Charges</p>
            <Receipt className="h-3.5 w-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
          </div>
          {loading && !data ? (
            <Skeleton className="mt-1 h-6 w-20" />
          ) : (
            <p className="num mt-0.5 text-base sm:text-lg font-bold text-slate-800 md:text-xl dark:text-zinc-200">
              {formatINR(kpiMetrics.chargesPaise)}
            </p>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">Brokerage & taxes</p>
        </div>

        {/* Total Trades */}
        <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Total Trades</p>
          {loading && !data ? (
            <Skeleton className="mt-1 h-6 w-14" />
          ) : (
            <p className="num mt-0.5 text-base sm:text-lg font-bold text-slate-900 md:text-xl dark:text-white">
              {kpiMetrics.tradesCount}
            </p>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">
            {selectedYear !== null ||
            dateFilter !== "all" ||
            segmentFilter !== "all" ||
            instrumentFilter !== "all" ||
            outcomeFilter !== "all" ||
            search.trim()
              ? "In filtered view"
              : "Completed trades"}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xs shrink-0 dark:border-white/10 dark:bg-[#141414]">
        <div className="relative w-full sm:w-auto sm:min-w-[14rem] sm:flex-1 flex items-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="search"
            placeholder="Search symbol, strike, or note..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 sm:h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs md:text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none transition-colors dark:border-white/10 dark:bg-[#181818] dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs w-full sm:w-auto justify-between sm:justify-start">
          {/* Market Segment Filter */}
          <select
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value)}
            className="h-8 sm:h-9 flex-1 sm:flex-initial rounded-lg border border-slate-200 bg-white px-2 sm:px-2.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none transition-colors cursor-pointer dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300"
          >
            <option value="all">All Segments</option>
            <option value="equity">Equity / Index F&O</option>
            <option value="commodity">Commodities</option>
          </select>

          {/* Instrument Filter */}
          <select
            value={instrumentFilter}
            onChange={(e) => setInstrumentFilter(e.target.value)}
            className="h-8 sm:h-9 flex-1 sm:flex-initial rounded-lg border border-slate-200 bg-white px-2 sm:px-2.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none transition-colors cursor-pointer dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300"
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
            className="h-8 sm:h-9 flex-1 sm:flex-initial rounded-lg border border-slate-200 bg-white px-2 sm:px-2.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 focus:border-brand-500 focus:outline-none transition-colors cursor-pointer dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300"
          >
            <option value="all">All Outcomes</option>
            <option value="profit">Profitable Only</option>
            <option value="loss">Loss Only</option>
          </select>

          {/* Date Filter */}
          <select
            value={dateFilter}
            onChange={(e) => {
              const val = e.target.value;
              setDateFilter(val);
              if (val === "today" || val === "week" || val === "month" || val === "year" || val === "fy") {
                if (selectedYear !== null && selectedYear !== new Date().getFullYear()) {
                  setSelectedYear(null);
                }
              }
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

      {/* Daily Trade Log Header Bar */}
      <div className="mb-1.5 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">Daily Trade Log</h2>
        <Link
          href="/income"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/90 px-3 py-1 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-200 hover:text-slate-900 transition dark:border-white/10 dark:bg-[#181818] dark:text-zinc-300"
        >
          <IndianRupee className="h-3.5 w-3.5 text-slate-600 dark:text-zinc-400" />
          <span>View Income</span>
        </Link>
      </div>

      {/* Trades Journal Table */}
      <div className="flex-1 min-h-0 flex flex-col">
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
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-card border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 shadow-xs">
                <tr>
                  <th className="px-2.5 py-2 font-medium whitespace-nowrap">Date</th>
                  <th className="px-2.5 py-2 font-medium">Instrument</th>
                  <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Qty</th>
                  <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Buy Price</th>
                  <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Sell Price</th>
                  <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Charges</th>
                  <th className="px-2 py-2 text-right font-medium whitespace-nowrap">Gross P&L</th>
                  <th className="px-2.5 py-2 text-right font-medium whitespace-nowrap">Net P&L</th>
                  <th className="px-2.5 py-2 font-medium">Note / Account</th>
                  <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                    Action
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
                    <tr key={t.id} className="group hover:bg-slate-50 transition-colors">
                      <td className="num whitespace-nowrap px-2.5 py-1.5 text-xs text-slate-600">
                        {displayDate(t.occurred_on)}
                      </td>

                      <td className="whitespace-nowrap px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
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
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-slate-900">{t.symbol}</span>
                            {t.strike_price_paise && (
                              <span className="num font-semibold text-slate-700">
                                {Math.floor(t.strike_price_paise / 100)}
                              </span>
                            )}
                            {resolveFnoSegment(t.symbol, t.segment) === "commodity" && (
                              <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-semibold text-amber-800">
                                MCX
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="num whitespace-nowrap px-2 py-1.5 text-right font-medium text-slate-700">
                        <div>{t.quantity}</div>
                        {t.lots && (
                          <div className="text-[10px] text-slate-400">
                            {t.lots} {t.lots === 1 ? "Lot" : "Lots"}
                          </div>
                        )}
                      </td>

                      <td className="num whitespace-nowrap px-2 py-1.5 text-right text-slate-600">
                        {formatINR(t.buy_price_paise)}
                      </td>

                      <td className="num whitespace-nowrap px-2 py-1.5 text-right text-slate-600">
                        {formatINR(t.sell_price_paise)}
                      </td>

                      <td className="num whitespace-nowrap px-2 py-1.5 text-right text-slate-500">
                        {t.charges_paise > 0 ? `-${formatINR(t.charges_paise)}` : "₹0.00"}
                      </td>

                      <td className="num whitespace-nowrap px-2 py-1.5 text-right text-slate-600">
                        {t.gross_pnl_paise >= 0
                          ? `+${formatINR(t.gross_pnl_paise)}`
                          : formatINR(t.gross_pnl_paise)}
                      </td>

                      <td className="num whitespace-nowrap px-2.5 py-1.5 text-right">
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
                            className={`num text-[10px] font-medium ${
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

                      <td className="max-w-[8rem] md:max-w-[11rem] truncate px-2.5 py-1.5 text-xs text-slate-500">
                        <div className="truncate">{t.note || "—"}</div>
                        {t.account?.name && (
                          <span className="text-[10px] text-slate-400">
                            via {t.account.name}
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingTrade(t);
                              setFormOpen(true);
                            }}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-900 transition"
                            title="Edit trade"
                            aria-label={`Edit trade for ${t.symbol}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(t)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            title="Delete trade"
                            aria-label={`Delete trade for ${t.symbol}`}
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

      <FnoContractNoteModal
        open={contractNoteModalOpen}
        accounts={accounts}
        onClose={() => setContractNoteModalOpen(false)}
        onImported={() => void load()}
        notify={notify}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Move F&O trade to Recently deleted?"
        body={
          deleteTarget
            ? `The trade record for ${deleteTarget.symbol} ${
                deleteTarget.strike_price_paise
                  ? `${Math.floor(deleteTarget.strike_price_paise / 100)} ${deleteTarget.instrument_type.toUpperCase()}`
                  : deleteTarget.instrument_type.toUpperCase()
              } on ${displayDate(deleteTarget.occurred_on)} with P&L of ${formatINR(
                deleteTarget.net_pnl_paise
              )} will be moved to Recently deleted and deducted from your Income totals. You can restore it anytime.`
            : ""
        }
        confirmLabel="Move to trash"
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
