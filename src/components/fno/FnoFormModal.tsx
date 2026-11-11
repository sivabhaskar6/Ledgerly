"use client";
import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  ChevronDown,
  ChevronUp,
  Calculator,
  RotateCcw,
  Sparkles,
} from "lucide-react";
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
  calculateGrowwCharges,
  getDefaultLotSize,
  resolveFnoSegment,
  FNO_INSTRUMENTS,
  FNO_SEGMENTS,
  POPULAR_EQUITY_SYMBOLS,
  POPULAR_COMMODITY_SYMBOLS,
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
  const [showGrowwBreakdown, setShowGrowwBreakdown] = useState(false);
  const [chargesManuallyEdited, setChargesManuallyEdited] = useState(false);

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
      segment: "equity",
      symbol: "NIFTY",
      instrument_type: "call",
      strike_price: "",
      trade_type: "buy_first",
      lots: "1",
      lot_size: "65",
      quantity: "65",
      buy_price: "",
      sell_price: "",
      charges: "40.00",
      occurred_on: todayISO(),
      account_id: "",
      note: "",
    },
  });

  const segment = watch("segment") || "equity";
  const instrumentType = watch("instrument_type") || "call";
  const symbol = watch("symbol") || "";
  const lotsStr = watch("lots") || "1";
  const lotSizeStr = watch("lot_size") || "65";
  const buyPriceStr = watch("buy_price") || "";
  const sellPriceStr = watch("sell_price") || "";
  const chargesStr = watch("charges") || "";

  // Derive total quantity: Lots * Lot Size
  const computedQuantity = useMemo(() => {
    const l = parseInt(lotsStr, 10);
    const ls = parseInt(lotSizeStr, 10);
    if (!isNaN(l) && l > 0 && !isNaN(ls) && ls > 0) {
      return l * ls;
    }
    return 0;
  }, [lotsStr, lotSizeStr]);

  // Keep hidden or auxiliary quantity form field in sync
  useEffect(() => {
    if (computedQuantity > 0) {
      setValue("quantity", String(computedQuantity));
    }
  }, [computedQuantity, setValue]);

  // Groww charges computation
  const growwBreakdown = useMemo(() => {
    const buyRupees = parseFloat(buyPriceStr) || 0;
    const sellRupees = parseFloat(sellPriceStr) || 0;
    return calculateGrowwCharges({
      segment,
      instrumentType,
      quantity: computedQuantity,
      buyPriceRupees: buyRupees,
      sellPriceRupees: sellRupees,
      symbol,
    });
  }, [segment, instrumentType, computedQuantity, buyPriceStr, sellPriceStr, symbol]);

  // Reset form when modal opens or trade changes
  useEffect(() => {
    if (open) {
      setError(null);
      setShowGrowwBreakdown(false);
      setChargesManuallyEdited(false);

      if (trade) {
        const seg = resolveFnoSegment(trade.symbol, trade.segment);
        const sym = trade.symbol;
        const ls = trade.lot_size
          ? String(trade.lot_size)
          : String(getDefaultLotSize(sym, seg));
        const lt = trade.lots
          ? String(trade.lots)
          : String(Math.max(1, Math.round(trade.quantity / parseInt(ls, 10))));

        reset({
          segment: seg,
          symbol: sym,
          instrument_type: trade.instrument_type,
          strike_price: trade.strike_price_paise
            ? paiseToRupeesString(trade.strike_price_paise)
            : "",
          expiry_date: trade.expiry_date || "",
          trade_type: trade.trade_type,
          lots: lt,
          lot_size: ls,
          quantity: String(trade.quantity),
          buy_price: paiseToRupeesString(trade.buy_price_paise),
          sell_price: paiseToRupeesString(trade.sell_price_paise),
          charges: paiseToRupeesString(trade.charges_paise),
          occurred_on: trade.occurred_on,
          account_id: trade.account_id || "",
          note: trade.note || "",
        });
      } else {
        const defaultLs = getDefaultLotSize("NIFTY", "equity");
        reset({
          segment: "equity",
          symbol: "NIFTY",
          instrument_type: "call",
          strike_price: "",
          expiry_date: "",
          trade_type: "buy_first",
          lots: "1",
          lot_size: String(defaultLs),
          quantity: String(defaultLs),
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

  // Auto-fill charges from Groww calculation if not manually overridden
  useEffect(() => {
    if (!open) return;
    if (trade && !chargesManuallyEdited) return; // Keep existing trade's saved charges on initial load

    if (!chargesManuallyEdited && growwBreakdown.totalChargesRupees > 0) {
      setValue("charges", growwBreakdown.totalChargesRupees.toFixed(2));
    }
  }, [
    open,
    trade,
    chargesManuallyEdited,
    growwBreakdown.totalChargesRupees,
    setValue,
  ]);

  // Handle switching segment (Equity <-> Commodities)
  function handleSegmentChange(newSegment: "equity" | "commodity") {
    if (segment === newSegment) return;
    setValue("segment", newSegment);

    if (newSegment === "commodity") {
      const isCurrentCommodity = (POPULAR_COMMODITY_SYMBOLS as readonly string[]).includes(
        symbol.toUpperCase()
      );
      const newSymbol = isCurrentCommodity ? symbol : "CRUDEOIL";
      setValue("symbol", newSymbol);
      setValue("lot_size", String(getDefaultLotSize(newSymbol, "commodity")));
    } else {
      const isCurrentEquity = (POPULAR_EQUITY_SYMBOLS as readonly string[]).includes(
        symbol.toUpperCase()
      );
      const newSymbol = isCurrentEquity ? symbol : "NIFTY";
      setValue("symbol", newSymbol);
      setValue("lot_size", String(getDefaultLotSize(newSymbol, "equity")));
    }
  }

  // Handle clicking quick symbol chip
  function handleSymbolSelect(newSymbol: string) {
    setValue("symbol", newSymbol);
    const autoLotSize = getDefaultLotSize(newSymbol, segment);
    setValue("lot_size", String(autoLotSize));
  }

  // Live P&L Preview calculation
  const livePnl = useMemo(() => {
    if (!computedQuantity || computedQuantity <= 0) return null;

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
      quantity: computedQuantity,
      buyPricePaise: buyPaise,
      sellPricePaise: sellPaise,
      chargesPaise,
    });
  }, [computedQuantity, buyPriceStr, sellPriceStr, chargesStr]);

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

        {/* 1. Instrument Type Selector (Call vs Put vs Future) */}
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

        {/* 2. Market Segment Selector: Strictly placed between Option Type and Symbol */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-700">
            Market Segment
          </label>
          <div className="grid grid-cols-2 gap-2">
            {FNO_SEGMENTS.map((seg) => {
              const selected = segment === seg.value;
              return (
                <button
                  key={seg.value}
                  type="button"
                  onClick={() => handleSegmentChange(seg.value)}
                  className={`flex flex-col items-start rounded-lg border p-2.5 text-left transition-all ${
                    selected
                      ? "border-brand-600 bg-brand-50/80 text-brand-950 ring-1 ring-brand-600 font-semibold shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-sm">
                    <span>{seg.value === "equity" ? "📈" : "🛢️"}</span>
                    <span>{seg.label}</span>
                  </div>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    {seg.sub}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Symbol with Dynamic Quick Chips based on selected segment */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-slate-700">
              Symbol / Underlying Index
            </label>
            <div className="flex flex-wrap gap-1">
              {(segment === "commodity"
                ? POPULAR_COMMODITY_SYMBOLS
                : POPULAR_EQUITY_SYMBOLS.slice(0, 6)
              ).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSymbolSelect(s)}
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                    symbol.toUpperCase() === s
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
                placeholder={
                  segment === "commodity"
                    ? "e.g. CRUDEOIL, NATURALGAS, GOLD"
                    : "e.g. NIFTY, BANKNIFTY, SENSEX, RELIANCE"
                }
                aria-describedby={d}
                {...register("symbol", {
                  onChange: (e) => {
                    const clean = (e.target.value as string).toUpperCase().trim();
                    const autoSeg = resolveFnoSegment(clean, segment);
                    if (autoSeg !== segment) {
                      setValue("segment", autoSeg);
                    }
                    const autoLs = getDefaultLotSize(clean, autoSeg);
                    setValue("lot_size", String(autoLs));
                  },
                })}
                className={`h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold uppercase ${
                  errors.symbol ? "border-red-400" : "border-slate-300"
                }`}
              />
            )}
          </FieldShell>
        </div>

        {/* 4. Strike Price & Trade Date */}
        <div className="grid gap-3 sm:grid-cols-2">
          {instrumentType !== "future" ? (
            <FieldShell
              label="Strike Price (₹)"
              error={errors.strike_price?.message}
            >
              {(id, d) => (
                <input
                  id={id}
                  inputMode="decimal"
                  placeholder={
                    segment === "commodity" ? "e.g. 6000" : "e.g. 24500"
                  }
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

          <TextField
            label="Trade Date"
            type="date"
            {...register("occurred_on")}
            error={errors.occurred_on?.message}
          />
        </div>

        {/* 5. Lots & Lot Size with Auto-Calculated Total Quantity Pill */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldShell
              label="Number of Lots"
              error={errors.lots?.message}
              hint="e.g. 1 lot, 2 lots"
            >
              {(id, d) => (
                <input
                  id={id}
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 1"
                  aria-describedby={d}
                  {...register("lots")}
                  className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold ${
                    errors.lots ? "border-red-400" : "border-slate-300"
                  }`}
                />
              )}
            </FieldShell>

            <FieldShell
              label="Lot Size (Auto-calculated)"
              error={errors.lot_size?.message}
              hint={
                symbol.toUpperCase() === "NIFTY"
                  ? "Nifty standard lot: 65"
                  : symbol.toUpperCase() === "SENSEX"
                  ? "Sensex standard lot: 20"
                  : symbol.toUpperCase() === "CRUDEOIL"
                  ? "Crude Oil standard lot: 100"
                  : "Exchange official lot size"
              }
            >
              {(id, d) => (
                <input
                  id={id}
                  type="number"
                  min="1"
                  step="1"
                  placeholder="e.g. 65"
                  aria-describedby={d}
                  {...register("lot_size")}
                  className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm font-semibold ${
                    errors.lot_size ? "border-red-400" : "border-slate-300"
                  }`}
                />
              )}
            </FieldShell>
          </div>

          <div className="mt-2.5 flex items-center justify-between rounded-lg bg-white px-3 py-2 border border-slate-200 shadow-xs text-xs">
            <span className="text-slate-600 font-medium">
              Calculated Total Quantity:
            </span>
            <span className="num font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
              {lotsStr || 1} {parseInt(lotsStr, 10) === 1 ? "Lot" : "Lots"} × {lotSizeStr || 1} ={" "}
              {computedQuantity} units
            </span>
          </div>
        </div>

        {/* 6. Pricing: Buy Price, Sell Price, and Groww Charges */}
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
            hint="Groww official rates"
            error={errors.charges?.message}
          >
            {(id, d) => (
              <div className="relative">
                <input
                  id={id}
                  inputMode="decimal"
                  placeholder="e.g. 40.00"
                  aria-describedby={d}
                  {...register("charges", {
                    onChange: () => setChargesManuallyEdited(true),
                  })}
                  className={`num h-10 w-full rounded-lg border bg-white px-3 pr-8 text-sm font-medium text-slate-700 ${
                    errors.charges ? "border-red-400" : "border-slate-300"
                  }`}
                />
                {growwBreakdown.totalChargesRupees > 0 && (
                  <button
                    type="button"
                    title="Reset to calculated Groww charges"
                    onClick={() => {
                      setChargesManuallyEdited(false);
                      setValue(
                        "charges",
                        growwBreakdown.totalChargesRupees.toFixed(2)
                      );
                    }}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-brand-600 transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </FieldShell>
        </div>

        {/* 7. Groww Official Charges Breakdown Toggle */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <Calculator className="h-4 w-4 text-brand-600" />
              <span>Groww Policy Charges:</span>
              <span className="num font-bold text-slate-900">
                ₹{growwBreakdown.totalChargesRupees.toFixed(2)}
              </span>
              <span className="text-[11px] text-slate-500">
                ({segment === "commodity" ? "MCX rates" : "NSE/BSE rates"})
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowGrowwBreakdown(!showGrowwBreakdown)}
              className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-700"
            >
              <span>{showGrowwBreakdown ? "Hide details" : "View breakdown"}</span>
              {showGrowwBreakdown ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {showGrowwBreakdown && (
            <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-slate-200 pt-2 text-[11px] text-slate-600 sm:grid-cols-3">
              <div>
                Brokerage (Groww ₹20/leg):{" "}
                <span className="num font-semibold text-slate-800">
                  {formatINR(growwBreakdown.brokeragePaise)}
                </span>
              </div>
              <div>
                {segment === "commodity" ? "CTT (0.05% MCX): " : "STT (0.15% sell): "}
                <span className="num font-semibold text-slate-800">
                  {formatINR(growwBreakdown.sttCttPaise)}
                </span>
              </div>
              <div>
                Exchange txn fee:{" "}
                <span className="num font-semibold text-slate-800">
                  {formatINR(growwBreakdown.exchangeFeePaise)}
                </span>
              </div>
              <div>
                IPFT (0.0005%):{" "}
                <span className="num font-semibold text-slate-800">
                  {formatINR(growwBreakdown.ipftPaise)}
                </span>
              </div>
              <div>
                Stamp duty (0.003% buy):{" "}
                <span className="num font-semibold text-slate-800">
                  {formatINR(growwBreakdown.stampDutyPaise)}
                </span>
              </div>
              <div>
                SEBI turnover (₹10/cr):{" "}
                <span className="num font-semibold text-slate-800">
                  {formatINR(growwBreakdown.sebiFeePaise)}
                </span>
              </div>
              <div>
                GST (18% on fees):{" "}
                <span className="num font-semibold text-slate-800">
                  {formatINR(growwBreakdown.gstPaise)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 8. Live Real-Time P&L Preview Banner */}
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
                    -{formatINR(livePnl.grossPnlPaise - livePnl.netPnlPaise)}
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
            <p className="mt-2 text-center text-[11px] font-medium text-slate-500 flex items-center justify-center gap-1">
              <Sparkles className="h-3 w-3 text-amber-500" />
              Net realized P&L automatically syncs to your <strong>Income</strong> and <strong>Savings</strong> sections.
            </p>
          </div>
        )}

        {/* 9. Optional Account & Notes */}
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
            placeholder="e.g. Scalp at resistance, MCX crude inventory"
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