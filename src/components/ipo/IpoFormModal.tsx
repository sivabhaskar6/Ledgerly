"use client";
import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TrendingUp, TrendingDown, Rocket } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { TextField, SelectField } from "@/components/ui/Field";
import { FormError } from "@/components/layout/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { createIpoGain, updateIpoGain } from "@/lib/data/ipo";
import { errorMessage } from "@/lib/data/expenses";
import {
  ipoFormSchema,
  computeIpoPnl,
  POPULAR_IPOS,
  type IpoFormValues,
} from "@/lib/validations/ipo";
import { formatINR, paiseToRupeesString, rupeesToPaise } from "@/lib/utils/money";
import { todayISO } from "@/lib/utils/dates";
import type { Account, IpoGainWithRefs } from "@/types/db";

type Props = {
  open: boolean;
  trade: IpoGainWithRefs | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
  notify: (type: "success" | "error", msg: string) => void;
};

export function IpoFormModal({
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
  } = useForm<IpoFormValues>({
    resolver: zodResolver(ipoFormSchema),
    defaultValues: {
      symbol: "TATATECH",
      name: "",
      quantity: "100",
      issue_price: "500",
      sold_price: "1200",
      charges: "20.00",
      occurred_on: todayISO(),
      account_id: "",
      note: "",
    },
  });

  const symbol = watch("symbol");
  const quantityStr = watch("quantity");
  const issuePriceStr = watch("issue_price");
  const soldPriceStr = watch("sold_price");
  const chargesStr = watch("charges");

  useEffect(() => {
    if (open) {
      setError(null);
      if (trade) {
        reset({
          symbol: trade.symbol,
          name: trade.name || "",
          quantity: String(trade.quantity),
          issue_price: paiseToRupeesString(trade.issue_price_paise),
          sold_price: paiseToRupeesString(trade.sold_price_paise),
          charges: paiseToRupeesString(trade.charges_paise),
          occurred_on: trade.occurred_on,
          account_id: trade.account_id || "",
          note: trade.note || "",
        });
      } else {
        reset({
          symbol: "TATATECH",
          name: "",
          quantity: "100",
          issue_price: "500",
          sold_price: "1200",
          charges: "20.00",
          occurred_on: todayISO(),
          account_id: "",
          note: "",
        });
      }
    }
  }, [open, trade, reset]);

  // Live real-time P&L calculation
  const livePnl = useMemo(() => {
    try {
      const qty = parseInt(quantityStr, 10);
      if (isNaN(qty) || qty <= 0) return null;
      if (!issuePriceStr || !soldPriceStr) return null;

      const issuePricePaise = rupeesToPaise(issuePriceStr);
      const soldPricePaise = rupeesToPaise(soldPriceStr);
      const chargesPaise = chargesStr && chargesStr.trim() ? rupeesToPaise(chargesStr) : 0;

      return computeIpoPnl({
        quantity: qty,
        issuePricePaise,
        soldPricePaise,
        chargesPaise,
      });
    } catch {
      return null;
    }
  }, [quantityStr, issuePriceStr, soldPriceStr, chargesStr]);

  async function onSubmit(values: IpoFormValues) {
    setError(null);
    try {
      const db = createClient();
      if (trade) {
        await updateIpoGain(db, trade.id, values);
        notify("success", `Updated IPO listing entry for ${values.symbol}.`);
      } else {
        await createIpoGain(db, values);
        notify("success", `Recorded IPO listing gain for ${values.symbol}.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Could not save IPO listing entry."));
    }
  }

  const isProfit = (livePnl?.netPnlPaise ?? 0) >= 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={trade ? "Edit IPO listing entry" : "Record IPO listing gain"}
      wide
    >
      <p className="mb-3 text-xs text-slate-500">
        Track IPO allotment issue price, listing sale price, and net listing gain or discount loss synced directly to Income.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
        {error && <FormError message={error} />}

        {/* Popular IPO Suggestions */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Quick select IPO
          </label>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_IPOS.map((sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setValue("symbol", sym, { shouldValidate: true })}
                className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                  symbol?.toUpperCase() === sym
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* Symbol & Full Name */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="IPO Symbol / Company"
            placeholder="e.g. TATATECH, BAJAJHFL"
            required
            error={errors.symbol?.message}
            {...register("symbol")}
          />

          <TextField
            label="Company full name (optional)"
            placeholder="e.g. Tata Technologies Ltd"
            error={errors.name?.message}
            {...register("name")}
          />
        </div>

        {/* Quantity & Allotment Issue Price */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Allotted Quantity (shares)"
            placeholder="e.g. 500"
            required
            error={errors.quantity?.message}
            {...register("quantity")}
          />

          <TextField
            label="Issue / Allotment Price per share (₹)"
            placeholder="e.g. 500.00"
            required
            error={errors.issue_price?.message}
            {...register("issue_price")}
          />
        </div>

        {/* Sold / Listing Price & Charges */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Sold / Listing Price per share (₹)"
            placeholder="e.g. 1200.00"
            required
            error={errors.sold_price?.message}
            {...register("sold_price")}
          />

          <TextField
            label="Charges & taxes (₹)"
            placeholder="e.g. 20.00"
            error={errors.charges?.message}
            {...register("charges")}
          />
        </div>

        {/* Live Net Profit/Loss Card */}
        {livePnl && (
          <div
            className={`rounded-xl border p-3.5 transition-all ${
              isProfit
                ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
                : "border-rose-200 bg-rose-50/70 text-rose-950"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isProfit ? (
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-rose-600" />
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Live Listing {isProfit ? "Gain" : "Loss"} (Net P&L)
                  </p>
                  <p
                    className={`num text-xl font-bold ${
                      isProfit ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {isProfit
                      ? `+${formatINR(livePnl.netPnlPaise)}`
                      : formatINR(livePnl.netPnlPaise)}
                    {livePnl.roiPct !== null && (
                      <span className="ml-2 text-xs font-semibold">
                        ({livePnl.roiPct >= 0 ? `+${livePnl.roiPct}%` : `${livePnl.roiPct}%`} listing pop)
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <div className="text-right text-xs text-slate-600">
                <p>
                  Gross:{" "}
                  <span className="num font-semibold">
                    {livePnl.grossPnlPaise >= 0
                      ? `+${formatINR(livePnl.grossPnlPaise)}`
                      : formatINR(livePnl.grossPnlPaise)}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Invested: {formatINR(livePnl.totalInvestedPaise)} → Realized: {formatINR(livePnl.totalSoldPaise)}
                </p>
              </div>
            </div>

            <p className="mt-2 text-[11px] text-slate-600 border-t border-slate-200/60 pt-1.5">
              {isProfit
                ? `⚡ This net profit will be added to your Income and increase This Month's Income.`
                : `⚡ This net listing loss will be deducted from your Income and decrease This Month's Income.`}
            </p>
          </div>
        )}

        {/* Date & Account */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label="Listing / Sold Date"
            type="date"
            required
            error={errors.occurred_on?.message}
            {...register("occurred_on")}
          />

          <SelectField
            label="Demat / Bank Account (optional)"
            error={errors.account_id?.message}
            {...register("account_id")}
          >
            <option value="">No account linked</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type})
              </option>
            ))}
          </SelectField>
        </div>

        {/* Note */}
        <TextField
          label="Note / Remarks (optional)"
          placeholder="e.g. Applied via Retail quota, sold 100% on listing day opening tick"
          error={errors.note?.message}
          {...register("note")}
        />

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting}>
            <Rocket className="h-4 w-4 mr-1.5" />
            {trade ? "Update IPO entry" : "Record IPO gain"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
