"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchInvestments, deleteInvestment, type PortfolioSummary, type HoldingSummary } from "@/lib/data/investments";
import { fetchAccounts } from "@/lib/data/accounts";
import { errorMessage } from "@/lib/data/expenses";
import { formatINR } from "@/lib/utils/money";
import { displayDate } from "@/lib/utils/dates";
import type { Account, Investment, InvestmentWithRefs } from "@/types/db";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { TradeFormModal } from "./TradeFormModal";
import { UpdatePriceModal } from "./UpdatePriceModal";

function tradeBadge(type: Investment["trade_type"]) {
  switch (type) {
    case "buy": return <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Buy</span>;
    case "sell": return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Sell</span>;
    case "ipo_apply": return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">IPO Apply</span>;
    case "ipo_allotment": return <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">IPO Allotted</span>;
    case "ipo_refund": return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">IPO Refund</span>;
  }
}

export function InvestmentsView() {
  const { notify } = useToast();
  const [data, setData] = useState<PortfolioSummary | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<"holdings" | "trades" | "ipo">("holdings");
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Investment | null>(null);
  const [priceModalHolding, setPriceModalHolding] = useState<HoldingSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvestmentWithRefs | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const [inv, acc] = await Promise.all([
        fetchInvestments(db),
        fetchAccounts(db),
      ]);
      setData(inv);
      setAccounts(acc);
    } catch (e) {
      setError(errorMessage(e, "Could not load investments."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDeleteTrade() {
    if (!deleteTarget) return;
    try {
      const db = createClient();
      await deleteInvestment(db, deleteTarget.id);
      notify("success", "Trade deleted.");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      notify("error", errorMessage(e, "Could not delete trade."));
    }
  }

  const ipoTrades = data?.trades.filter((t) => t.trade_type === "ipo_apply" || t.trade_type === "ipo_refund" || t.trade_type === "ipo_allotment") ?? [];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="mb-2 sm:mb-2.5 flex flex-wrap items-center justify-between gap-2 sm:gap-3 shrink-0">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white">Investments & Capital</h1>
          <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400">Track stocks, mutual funds, and IPO movements separately from everyday spending.</p>
        </div>
        <Button onClick={() => { setEditingTrade(null); setTradeModalOpen(true); }} className="h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs font-semibold shadow-xs">
          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
          Record trade
        </Button>
      </div>

      {data?.tableMissing && (
        <div role="alert" className="mb-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 shrink-0">
          <p className="font-semibold">Setup Required: Run Database Migration</p>
          <p className="mt-0.5">
            The <code className="rounded bg-amber-100 px-1 py-0.5 text-xs font-mono">investments</code> table is not yet created in your Supabase project.
            Copy and paste the SQL from <code className="rounded bg-amber-100 px-1 py-0.5 text-xs font-mono">supabase/migrations/0004_accounts_investments_imports.sql</code> into your <strong>Supabase SQL Editor</strong> to enable investment tracking.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 shrink-0">
          {error} <button className="underline" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {/* Financial Summary Cards */}
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4 shrink-0">
        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Invested Capital</p>
          {loading && !data ? (
            <Skeleton className="mt-1 h-6 w-24" />
          ) : (
            <p className="num mt-0.5 text-base sm:text-lg font-bold md:text-xl text-slate-900 dark:text-white">
              {formatINR(data?.totalInvestedPaise ?? 0)}
            </p>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">Total cost basis</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Current Market Value</p>
          {loading && !data ? (
            <Skeleton className="mt-1 h-6 w-24" />
          ) : data?.totalMarketValuePaise !== null ? (
            <p className="num mt-0.5 text-base sm:text-lg font-bold md:text-xl text-indigo-700 dark:text-indigo-400">
              {formatINR(data?.totalMarketValuePaise ?? 0)}
            </p>
          ) : (
            <div className="mt-0.5 flex items-center gap-1 text-amber-600">
              <span className="text-xs font-semibold">Unconfigured</span>
              <span className="rounded bg-amber-50 px-1 py-0.5 text-[9px] font-medium text-amber-700">Set</span>
            </div>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">
            {data?.hasUnconfiguredPrices ? "Set prices below" : "Live portfolio valuation"}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">Realized P&L</p>
          {loading && !data ? (
            <Skeleton className="mt-1 h-6 w-24" />
          ) : (
            <div className="mt-0.5 flex items-center gap-1">
              {(data?.totalRealizedGainPaise ?? 0) >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-rose-400 shrink-0" />
              )}
              <p className={`num text-base sm:text-lg font-bold md:text-xl ${(data?.totalRealizedGainPaise ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-rose-400"}`}>
                {formatINR(data?.totalRealizedGainPaise ?? 0)}
              </p>
            </div>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">Net booked gain</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-xs dark:border-white/10 dark:bg-[#141414]">
          <p className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-zinc-400">IPO Blocked Funds</p>
          {loading && !data ? (
            <Skeleton className="mt-1 h-6 w-24" />
          ) : (
            <div className="mt-0.5 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <p className="num text-base sm:text-lg font-bold md:text-xl text-amber-700 dark:text-amber-400">
                {formatINR(data?.totalIpoBlockedPaise ?? 0)}
              </p>
            </div>
          )}
          <p className="text-[9px] sm:text-[10px] text-slate-400 dark:text-zinc-500 truncate">Escrow / capital</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-2 border-b border-slate-200 shrink-0">
        <nav className="-mb-px flex gap-4 text-xs font-medium" aria-label="Investment tabs">
          <button
            onClick={() => setTab("holdings")}
            className={`pb-2 transition-colors ${tab === "holdings" ? "border-b-2 border-brand-600 text-brand-700 font-semibold" : "text-slate-500 hover:text-slate-700"}`}
          >
            Holdings ({data?.holdings.filter((h) => h.netQuantity > 0).length ?? 0})
          </button>
          <button
            onClick={() => setTab("trades")}
            className={`pb-2 transition-colors ${tab === "trades" ? "border-b-2 border-brand-600 text-brand-700 font-semibold" : "text-slate-500 hover:text-slate-700"}`}
          >
            Trade Journal ({data?.trades.length ?? 0})
          </button>
          <button
            onClick={() => setTab("ipo")}
            className={`pb-2 transition-colors ${tab === "ipo" ? "border-b-2 border-brand-600 text-brand-700 font-semibold" : "text-slate-500 hover:text-slate-700"}`}
          >
            IPO Applications ({ipoTrades.length})
          </button>
        </nav>
      </div>

      {/* Tab Content: Holdings */}
      {tab === "holdings" && (
        <div className="flex-1 min-h-0 flex flex-col">
          {loading && !data ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (data?.holdings.filter((h) => h.netQuantity > 0).length ?? 0) === 0 ? (
            <EmptyState
              title="No active holdings"
              body="Record your stock or mutual fund purchases to see positions, cost basis, and returns."
              action={
                <Button onClick={() => { setEditingTrade(null); setTradeModalOpen(true); }} className="h-9 px-3.5 text-xs font-semibold shadow-xs">
                  <Plus className="h-4 w-4" aria-hidden />Record first trade
                </Button>
              }
            />
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-card border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Symbol & Name</th>
                    <th className="px-4 py-2 font-semibold">Type</th>
                    <th className="px-4 py-2 text-right font-semibold">Quantity</th>
                    <th className="px-4 py-2 text-right font-semibold">Avg Buy Price</th>
                    <th className="px-4 py-2 text-right font-semibold">Cost Basis</th>
                    <th className="px-4 py-2 text-right font-semibold">Market Price</th>
                    <th className="px-4 py-2 text-right font-semibold">Current Value</th>
                    <th className="px-4 py-2 text-right font-semibold">Unrealized P&L</th>
                    <th className="px-4 py-2 text-right font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.holdings.filter((h) => h.netQuantity > 0).map((h) => (
                    <tr key={h.symbol} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2">
                        <p className="font-semibold text-slate-900">{h.symbol}</p>
                        <p className="text-[11px] text-slate-500">{h.name}</p>
                      </td>
                      <td className="px-4 py-2 text-[11px] text-slate-500 uppercase">{h.asset_type}</td>
                      <td className="num px-4 py-2 text-right text-slate-700">{h.netQuantity}</td>
                      <td className="num px-4 py-2 text-right text-slate-700">{formatINR(h.averageBuyPricePaise)}</td>
                      <td className="num px-4 py-2 text-right font-medium text-slate-900">{formatINR(h.totalInvestedPaise)}</td>
                      <td className="num px-4 py-2 text-right">
                        {h.currentPricePaise !== null ? (
                          formatINR(h.currentPricePaise)
                        ) : (
                          <span className="text-xs text-slate-400 italic">Unconfigured</span>
                        )}
                      </td>
                      <td className="num px-4 py-2 text-right font-medium">
                        {h.currentValuePaise !== null ? (
                          formatINR(h.currentValuePaise)
                        ) : (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="num px-4 py-2 text-right font-medium">
                        {h.unrealizedGainPaise !== null ? (
                          <span className={h.unrealizedGainPaise >= 0 ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>
                            {formatINR(h.unrealizedGainPaise)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setPriceModalHolding(h)}
                          className="rounded-lg px-2 py-1 text-xs text-brand-700 hover:bg-slate-100 font-medium"
                        >
                          {h.currentPricePaise !== null ? "Edit price" : "Set price"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Trades Journal */}
      {tab === "trades" && (
        <div className="flex-1 min-h-0 flex flex-col">
          {(data?.trades.length ?? 0) === 0 ? (
            <EmptyState
              title="No trades recorded"
              body="Add stock purchases, sales, or IPO entries to populate your investment history."
            />
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-card border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Date</th>
                    <th className="px-4 py-2 font-semibold">Action</th>
                    <th className="px-4 py-2 font-semibold">Symbol & Name</th>
                    <th className="px-4 py-2 text-right font-semibold">Qty</th>
                    <th className="px-4 py-2 text-right font-semibold">Price</th>
                    <th className="px-4 py-2 text-right font-semibold">Total Amount</th>
                    <th className="px-4 py-2 font-semibold">Account</th>
                    <th className="px-4 py-2 text-right font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.trades.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="num whitespace-nowrap px-4 py-2 text-slate-600">{displayDate(t.occurred_on)}</td>
                      <td className="px-4 py-2">{tradeBadge(t.trade_type)}</td>
                      <td className="px-4 py-2">
                        <span className="font-semibold text-slate-900">{t.symbol}</span>
                        <span className="ml-2 text-xs text-slate-500">{t.name}</span>
                      </td>
                      <td className="num px-4 py-2 text-right text-slate-700">{t.quantity}</td>
                      <td className="num px-4 py-2 text-right text-slate-700">{formatINR(t.price_paise)}</td>
                      <td className="num px-4 py-2 text-right font-semibold text-slate-900">{formatINR(t.amount_paise)}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{t.account?.name ?? "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => { setEditingTrade(t); setTradeModalOpen(true); }}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            aria-label={`Edit ${t.symbol}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(t)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                            aria-label={`Delete ${t.symbol}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: IPO Applications */}
      {tab === "ipo" && (
        <div className="flex-1 min-h-0 flex flex-col">
          {ipoTrades.length === 0 ? (
            <EmptyState
              title="No IPO applications"
              body="Record IPO applications to monitor blocked funds, allotments, and refunds without misclassifying them as everyday spending."
              action={
                <Button onClick={() => { setEditingTrade(null); setTradeModalOpen(true); }} className="h-9 px-3.5 text-xs font-semibold shadow-xs">
                  <Plus className="h-4 w-4" aria-hidden />Apply for IPO
                </Button>
              }
            />
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-card border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold shadow-xs">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Date</th>
                    <th className="px-4 py-2 font-semibold">Type</th>
                    <th className="px-4 py-2 font-semibold">IPO Company</th>
                    <th className="px-4 py-2 text-right font-semibold">Amount Blocked / Refunded</th>
                    <th className="px-4 py-2 font-semibold">Account</th>
                    <th className="px-4 py-2 font-semibold">Note</th>
                    <th className="px-4 py-2 text-right font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ipoTrades.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="num whitespace-nowrap px-4 py-2 text-slate-600">{displayDate(t.occurred_on)}</td>
                      <td className="px-4 py-2">{tradeBadge(t.trade_type)}</td>
                      <td className="px-4 py-2">
                        <span className="font-semibold text-slate-900">{t.symbol}</span>
                        <span className="ml-2 text-xs text-slate-500">{t.name}</span>
                      </td>
                      <td className="num px-4 py-2 text-right font-semibold text-slate-900">{formatINR(t.amount_paise)}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{t.account?.name ?? "—"}</td>
                      <td className="max-w-[12rem] truncate px-4 py-2 text-xs text-slate-500">{t.note ?? "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setDeleteTarget(t)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <TradeFormModal
        open={tradeModalOpen}
        trade={editingTrade}
        accounts={accounts}
        onClose={() => setTradeModalOpen(false)}
        onSaved={() => void load()}
        notify={notify}
      />

      <UpdatePriceModal
        open={!!priceModalHolding}
        holding={priceModalHolding}
        onClose={() => setPriceModalHolding(null)}
        onSaved={() => void load()}
        notify={notify}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete trade entry?"
        body={deleteTarget ? `"${deleteTarget.symbol} (${deleteTarget.trade_type})" will be removed from your portfolio calculations.` : ""}
        confirmLabel="Delete"
        onConfirm={() => void handleDeleteTrade()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
