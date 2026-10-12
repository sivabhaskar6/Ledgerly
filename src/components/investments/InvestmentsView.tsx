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
import { PageHeader } from "@/components/layout/PageHeader";
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
    <>
      <PageHeader
        title="Investments & Capital"
        description="Track stocks, mutual funds, and IPO movements separately from everyday spending."
        actions={
          <Button onClick={() => { setEditingTrade(null); setTradeModalOpen(true); }}>
            <Plus className="h-4 w-4" aria-hidden />
            Record trade
          </Button>
        }
      />

      {data?.tableMissing && (
        <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Setup Required: Run Database Migration</p>
          <p className="mt-1">
            The <code className="rounded bg-amber-100 px-1 py-0.5 text-xs font-mono">investments</code> table is not yet created in your Supabase project.
            Copy and paste the SQL from <code className="rounded bg-amber-100 px-1 py-0.5 text-xs font-mono">supabase/migrations/0004_accounts_investments_imports.sql</code> into your <strong>Supabase SQL Editor</strong> to enable investment tracking.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error} <button className="underline" onClick={() => void load()}>Try again</button>
        </div>
      )}

      {/* Financial Summary Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-card border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Invested Capital</p>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className="num mt-1 text-xl font-semibold text-slate-900">
              {formatINR(data?.totalInvestedPaise ?? 0)}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">Total cost basis of holdings</p>
        </div>

        <div className="rounded-card border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Current Market Value</p>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : data?.totalMarketValuePaise !== null ? (
            <p className="num mt-1 text-xl font-semibold text-indigo-700">
              {formatINR(data?.totalMarketValuePaise ?? 0)}
            </p>
          ) : (
            <div className="mt-1 flex items-center gap-1.5 text-amber-600">
              <span className="text-sm font-semibold">Unconfigured</span>
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Set prices</span>
            </div>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {data?.hasUnconfiguredPrices ? "Configure market prices below" : "Live portfolio valuation"}
          </p>
        </div>

        <div className="rounded-card border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Realized P&L</p>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <div className="mt-1 flex items-center gap-1">
              {(data?.totalRealizedGainPaise ?? 0) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <p className={`num text-xl font-semibold ${(data?.totalRealizedGainPaise ?? 0) >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                {formatINR(data?.totalRealizedGainPaise ?? 0)}
              </p>
            </div>
          )}
          <p className="mt-1 text-xs text-slate-400">Net booked gain from sales</p>
        </div>

        <div className="rounded-card border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">IPO Blocked Funds</p>
          {loading && !data ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <div className="mt-1 flex items-center gap-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <p className="num text-xl font-semibold text-amber-700">
                {formatINR(data?.totalIpoBlockedPaise ?? 0)}
              </p>
            </div>
          )}
          <p className="mt-1 text-xs text-slate-400">Escrow / capital movements</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 border-b border-slate-200">
        <nav className="-mb-px flex gap-6" aria-label="Investment tabs">
          <button
            onClick={() => setTab("holdings")}
            className={`pb-3 text-sm font-medium transition-colors ${tab === "holdings" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-700"}`}
          >
            Holdings ({data?.holdings.filter((h) => h.netQuantity > 0).length ?? 0})
          </button>
          <button
            onClick={() => setTab("trades")}
            className={`pb-3 text-sm font-medium transition-colors ${tab === "trades" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-700"}`}
          >
            Trade Journal ({data?.trades.length ?? 0})
          </button>
          <button
            onClick={() => setTab("ipo")}
            className={`pb-3 text-sm font-medium transition-colors ${tab === "ipo" ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-700"}`}
          >
            IPO Applications ({ipoTrades.length})
          </button>
        </nav>
      </div>

      {/* Tab Content: Holdings */}
      {tab === "holdings" && (
        <div>
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
                <Button onClick={() => { setEditingTrade(null); setTradeModalOpen(true); }}>
                  <Plus className="h-4 w-4" aria-hidden />Record first trade
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Symbol & Name</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 text-right font-medium">Quantity</th>
                    <th className="px-4 py-3 text-right font-medium">Avg Buy Price</th>
                    <th className="px-4 py-3 text-right font-medium">Cost Basis</th>
                    <th className="px-4 py-3 text-right font-medium">Market Price</th>
                    <th className="px-4 py-3 text-right font-medium">Current Value</th>
                    <th className="px-4 py-3 text-right font-medium">Unrealized P&L</th>
                    <th className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.holdings.filter((h) => h.netQuantity > 0).map((h) => (
                    <tr key={h.symbol} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{h.symbol}</p>
                        <p className="text-xs text-slate-500">{h.name}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 uppercase">{h.asset_type}</td>
                      <td className="num px-4 py-3 text-right text-slate-700">{h.netQuantity}</td>
                      <td className="num px-4 py-3 text-right text-slate-700">{formatINR(h.averageBuyPricePaise)}</td>
                      <td className="num px-4 py-3 text-right font-medium text-slate-900">{formatINR(h.totalInvestedPaise)}</td>
                      <td className="num px-4 py-3 text-right">
                        {h.currentPricePaise !== null ? (
                          formatINR(h.currentPricePaise)
                        ) : (
                          <span className="text-xs text-slate-400 italic">Unconfigured</span>
                        )}
                      </td>
                      <td className="num px-4 py-3 text-right font-medium">
                        {h.currentValuePaise !== null ? (
                          formatINR(h.currentValuePaise)
                        ) : (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="num px-4 py-3 text-right font-medium">
                        {h.unrealizedGainPaise !== null ? (
                          <span className={h.unrealizedGainPaise >= 0 ? "text-emerald-700" : "text-red-600"}>
                            {formatINR(h.unrealizedGainPaise)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setPriceModalHolding(h)}
                          className="rounded-lg p-1.5 text-xs text-brand-700 hover:bg-slate-100"
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
        <div>
          {(data?.trades.length ?? 0) === 0 ? (
            <EmptyState
              title="No trades recorded"
              body="Add stock purchases, sales, or IPO entries to populate your investment history."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Symbol & Name</th>
                    <th className="px-4 py-3 text-right font-medium">Qty</th>
                    <th className="px-4 py-3 text-right font-medium">Price</th>
                    <th className="px-4 py-3 text-right font-medium">Total Amount</th>
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.trades.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="num whitespace-nowrap px-4 py-3 text-slate-600">{displayDate(t.occurred_on)}</td>
                      <td className="px-4 py-3">{tradeBadge(t.trade_type)}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900">{t.symbol}</span>
                        <span className="ml-2 text-xs text-slate-500">{t.name}</span>
                      </td>
                      <td className="num px-4 py-3 text-right text-slate-700">{t.quantity}</td>
                      <td className="num px-4 py-3 text-right text-slate-700">{formatINR(t.price_paise)}</td>
                      <td className="num px-4 py-3 text-right font-semibold text-slate-900">{formatINR(t.amount_paise)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{t.account?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => { setEditingTrade(t); setTradeModalOpen(true); }}
                            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900"
                            aria-label={`Edit ${t.symbol}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(t)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                            aria-label={`Delete ${t.symbol}`}
                          >
                            <Trash2 className="h-4 w-4" />
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
        <div>
          {ipoTrades.length === 0 ? (
            <EmptyState
              title="No IPO applications"
              body="Record IPO applications to monitor blocked funds, allotments, and refunds without misclassifying them as everyday spending."
              action={
                <Button onClick={() => { setEditingTrade(null); setTradeModalOpen(true); }}>
                  <Plus className="h-4 w-4" aria-hidden />Apply for IPO
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">IPO Company</th>
                    <th className="px-4 py-3 text-right font-medium">Amount Blocked / Refunded</th>
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 font-medium">Note</th>
                    <th className="px-4 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ipoTrades.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="num whitespace-nowrap px-4 py-3 text-slate-600">{displayDate(t.occurred_on)}</td>
                      <td className="px-4 py-3">{tradeBadge(t.trade_type)}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900">{t.symbol}</span>
                        <span className="ml-2 text-xs text-slate-500">{t.name}</span>
                      </td>
                      <td className="num px-4 py-3 text-right font-semibold text-slate-900">{formatINR(t.amount_paise)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{t.account?.name ?? "—"}</td>
                      <td className="max-w-[12rem] truncate px-4 py-3 text-xs text-slate-500">{t.note ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setDeleteTarget(t)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
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
    </>
  );
}
