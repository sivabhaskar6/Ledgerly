"use client";
import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Activity } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { TextField, SelectField, FieldShell } from "@/components/ui/Field";
import { FormError } from "@/components/layout/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { createFnoTrade, updateFnoTrade } from "@/lib/data/fno";
import { errorMessage } from "@/lib/data/expenses";
import {
  fnoFormSchema,
  computeFnoPnl,
  POPULAR_FNO_SYMBOLS,
  FNO_INSTRUMENTS,
  type FnoFormValues,
} from "@/lib/validations/fno";
import { formatINR, paiseToRupeesString, rupeesToPaise } from "@/lib/utils/money";
import { todayISO } from "@/lib/utils/dates";
import type { Account, FnoTradeWithRefs } from "@/types/db";

type Props = {
  open: boolean;
  trade: FnoTradeWithRefs | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
  notify: (type: "success" | "error", msg: string) => void;
};

export function FnoFormModal({
  open,
  trade,
  accounts,
  onClose,
  onSaved,
  notify,
}: Props) {
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FnoFormValues>({
    resolver: zodResolver(fnoFormSchema),
    defaultValues: {
      symbol: "NIFTY",
      instrument_type: "call",
      strike_price: "",
      trade_type: "buy_first",
      quantity: "50",
      buy_price: "",
      sell_price: "",
      charges: "40.00",
      occurred_on: todayISO(),
      account_id: "",
      note: "",
    },
  });

  const instrumentType = watch("instrument_type");
  const symbol = watch("symbol");
  const quantityStr = watch("quantity");
  const buyPriceStr = watch("buy_price");
  const sellPriceStr = watch("sell_price");
  const chargesStr = watch("charges");

  useEffect(() => {
    if (open) {
      setError(null);
      if (trade) {
        reset({
          symbol: trade.symbol,
          instrument_type: trade.instrument_type,
          strike_price: trade.strike_price_paise
            ? paiseToRupeesString(trade.strike_price_paise)
            : "",
          expiry_date: trade.expiry_date || "",
          trade_type: trade.trade_type,
          quantity: String(trade.quantity),
          buy_price: paiseToRupeesString(trade.buy_price_paise),
          sell_price: paiseToRupeesString(trade.sell_price_paise),
          charges: paiseToRupeesString(trade.charges_paise),
          occurred_on: trade.occurred_on,
          account_id: trade.account_id || "",
          note: trade.note || "",
        });
      } else {
        reset({
          symbol: "NIFTY",
          instrument_type: "call",
          strike_price: "",
          expiry_date: "",
          trade_type: "buy_first",
          quantity: "50",
          buy_price: "",
          sell_price: "",
          charges: "40.00",
          occurred_on: todayISO(),
          account_id: accounts[0]?.id || "",
          note: "",
        });
      }
    }
  }, [open, trade, accounts, reset]);

  // Live P&L Calculation preview
  const livePnl = useMemo(() => {
    const qty = parseInt(quantityStr, 10);
    if (!qty || isNaN(qty) || qty <= 0) return null;

    let buyPaise = 0;
    let sellPaise = 0;
    let chargesPaise = 0;

    try {
      buyPaise = buyPriceStr ? rupeesToPaise(buyPriceStr) : 0;
    } catch {
      return null;
    }

    try {
      sellPaise = sellPriceStr ? rupeesToPaise(sellPriceStr) : 0;
    } catch {
      return null;
    }

    try {
      chargesPaise = chargesStr && chargesStr.trim() ? rupeesToPaise(chargesStr) : 0;
    } catch {
      chargesPaise = 0;
    }

    if (buyPaise === 0 && sellPaise === 0) return null;

    return computeFnoPnl({
      quantity: qty,
      buyPricePaise: buyPaise,
      sellPricePaise: sellPaise,
      chargesPaise,
    });
  }, [quantityStr, buyPriceStr, sellPriceStr, chargesStr]);

  async function onSubmit(v: FnoFormValues) {
    setError(null);
    try {
      const db = createClient();
      if (trade) {
        await updateFnoTrade(db, trade.id, v);
        notify("success", "F&O trade updated.");
      } else {
        await createFnoTrade(db, v);
        notify("success", "F&O trade recorded.");
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Could not save F&O trade."));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={trade ? "Edit F&O trade" : "Record F&O daily trade"}
      wide
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError message={error} />

        {/* Instrument Type Selector (Call vs Put vs Future) */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">
            Option / Instrument Type
          </label>
          <div className="grid grid-cols-3 gap-2">
            {FNO_INSTRUMENTS.map((inst) => {
              const selected = instrumentType === inst.value;
              return (
                <button
                  key={inst.value}
                  type="button"
                  onClick={() => setValue("instrument_type", inst.value)}
                  className={`flex flex-col items-center justify-center rounded-lg border p-2.5 text-center transition-all ${
                    selected
                      ? inst.value === "call"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-600 font-semibold"
                        : inst.value === "put"
                        ? "border-rose-600 bg-rose-50 text-rose-950 ring-1 ring-rose-600 font-semibold"
                        : "border-brand-600 bg-brand-50 text-brand-950 ring-1 ring-brand-600 font-semibold"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-sm">
                    {inst.value === "call" && (
                      <ArrowUpRight className="h-4 w-4 text-emerald-600" aria-hidden />
                    )}
                    {inst.value === "put" && (
                      <ArrowDownRight className="h-4 w-4 text-rose-600" aria-hidden />
                    )}
                    {inst.value === "future" && (
                      <Activity className="h-4 w-4 text-brand-600" aria-hidden />
                    )}
                    <span>{inst.label}</span>
                  </div>
                  <span className="mt-0.5 text-[11px] text-slate-400">
                    {inst.value === "call"
                      ? "Bullish (CE)"
                      : inst.value === "put"
                      ? "Bearish (PE)"
                      : "Futures contract"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Symbol with Quick Chips */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-slate-700">
              Symbol / Underlying Index
            </label>
            <div className="flex flex-wrap gap-1">
              {POPULAR_FNO_SYMBOLS.slice(0, 5).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setValue("symbol", s)}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                    symbol === s
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <FieldShell label="" error={errors.symbol?.message}>
            {(id, d) => (
              <input
                id={id}
                placeholder="e.g. NIFTY, BANKNIFTY, RELIANCE"
                aria-describedby={d}
                {...register("symbol")}
                className={`h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold uppercase ${
                  errors.symbol ? "border-red-400" : "border-slate-300"
                }`}
              />
            )}
          </FieldShell>
        </div>

        {/* Strike Price & Quantity */}
        <div className="grid gap-3 sm:grid-cols-3">
          {instrumentType !== "future" ? (
            <FieldShell
              label="Strike Price (₹)"
              error={errors.strike_price?.message}
            >
              {(id, d) => (
                <input
                  id={id}
                  inputMode="decimal"
                  placeholder="e.g. 24500"
                  aria-describedby={d}
                  {...register("strike_price")}
                  className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm font-medium ${
                    errors.strike_price ? "border-red-400" : "border-slate-300"
                  }`}
                />
              )}
            </FieldShell>
          ) : (
            <SelectField
              label="Trade Type"
              {...register("trade_type")}
              error={errors.trade_type?.message}
            >
              <option value="buy_first">Buy (Long)</option>
              <option value="sell_first">Sell (Short)</option>
            </SelectField>
          )}

          <FieldShell
            label="Quantity / Lot size"
            error={errors.quantity?.message}
            hint={
              symbol === "NIFTY"
                ? "Lot: 25 / 50"
                : symbol === "BANKNIFTY"
                ? "Lot: 15 / 30"
                : undefined
            }
          >
            {(id, d) => (
              <input
                id={id}
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 50"
                aria-describedby={d}
                {...register("quantity")}
                className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm font-medium ${
                  errors.quantity ? "border-red-400" : "border-slate-300"
                }`}
              />
            )}
          </FieldShell>

          <TextField
            label="Trade Date"
            type="date"
            {...register("occurred_on")}
            error={errors.occurred_on?.message}
          />
        </div>

        {/* Pricing: Buy Price, Sell Price, and Charges */}
        <div className="grid gap-3 sm:grid-cols-3">
          <FieldShell
            label="Bought at price (₹)"
            error={errors.buy_price?.message}
          >
            {(id, d) => (
              <input
                id={id}
                inputMode="decimal"
                placeholder="e.g. 110.50"
                aria-describedby={d}
                {...register("buy_price")}
                className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold ${
                  errors.buy_price ? "border-red-400" : "border-slate-300"
                }`}
              />
            )}
          </FieldShell>

          <FieldShell
            label="Sold at price (₹)"
            error={errors.sell_price?.message}
          >
            {(id, d) => (
              <input
                id={id}
                inputMode="decimal"
                placeholder="e.g. 155.00"
                aria-describedby={d}
                {...register("sell_price")}
                className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold ${
                  errors.sell_price ? "border-red-400" : "border-slate-300"
                }`}
              />
            )}
          </FieldShell>

          <FieldShell
            label="Charges & Taxes (₹)"
            hint="Brokerage, STT, exchange fees"
            error={errors.charges?.message}
          >
            {(id, d) => (
              <input
                id={id}
                inputMode="decimal"
                placeholder="e.g. 40.00"
                aria-describedby={d}
                {...register("charges")}
                className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-700 ${
                  errors.charges ? "border-red-400" : "border-slate-300"
                }`}
              />
            )}
          </FieldShell>
        </div>

        {/* Live Real-Time P&L Preview Banner */}
        {livePnl && (
          <div
            className={`rounded-lg border p-3.5 transition-all ${
              livePnl.netPnlPaise > 0
                ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
                : livePnl.netPnlPaise < 0
                ? "border-rose-200 bg-rose-50/90 text-rose-950"
                : "border-slate-200 bg-slate-50 text-slate-800"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {livePnl.netPnlPaise > 0 ? (
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                ) : livePnl.netPnlPaise < 0 ? (
                  <TrendingDown className="h-5 w-5 text-rose-600" />
                ) : (
                  <Activity className="h-5 w-5 text-slate-500" />
                )}
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-600">
                    Calculated Net P&L:
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`num text-xl font-bold ${
                        livePnl.netPnlPaise > 0
                          ? "text-emerald-700"
                          : livePnl.netPnlPaise < 0
                          ? "text-rose-700"
                          : "text-slate-800"
                      }`}
                    >
                      {livePnl.netPnlPaise > 0
                        ? `+${formatINR(livePnl.netPnlPaise)}`
                        : formatINR(livePnl.netPnlPaise)}
                    </span>
                    {livePnl.roiPct !== null && (
                      <span
                        className={`num text-xs font-semibold ${
                          livePnl.roiPct > 0
                            ? "text-emerald-600"
                            : livePnl.roiPct < 0
                            ? "text-rose-600"
                            : "text-slate-500"
                        }`}
                      >
                        ({livePnl.roiPct > 0 ? `+${livePnl.roiPct}` : livePnl.roiPct}%)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right text-xs space-y-0.5 text-slate-500">
                <div>
                  Gross P&L:{" "}
                  <span className="num font-medium text-slate-700">
                    {livePnl.grossPnlPaise >= 0
                      ? `+${formatINR(livePnl.grossPnlPaise)}`
                      : formatINR(livePnl.grossPnlPaise)}
                  </span>
                </div>
                <div>
                  Charges:{" "}
                  <span className="num font-medium text-slate-700">
                    -{formatINR(livePnl.buyTurnoverPaise > 0 ? (livePnl.grossPnlPaise - livePnl.netPnlPaise) : 0)}
                  </span>
                </div>
                <div>
                  Turnover:{" "}
                  <span className="num font-medium text-slate-700">
                    {formatINR(livePnl.buyTurnoverPaise + livePnl.sellTurnoverPaise)}
                  </span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] font-medium text-slate-500">
              ✨ Net realized P&L automatically syncs to your <strong>Income</strong> section (+ adds profits, − reduces losses) and reflects in this month&apos;s income &amp; dashboard.
            </p>
          </div>
        )}

        {/* Optional Account & Notes */}
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Trading Account (optional)"
            {...register("account_id")}
            error={errors.account_id?.message}
          >
            <option value="">No account linked</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type})
              </option>
            ))}
          </SelectField>

          <TextField
            label="Strategy / Note (optional)"
            placeholder="e.g. Scalp at 24500 resistance, Hero or Zero"
            {...register("note")}
            error={errors.note?.message}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {trade ? "Save changes" : "Record F&O trade"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
