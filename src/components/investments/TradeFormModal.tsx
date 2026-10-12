"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField, FieldShell } from "@/components/ui/Field";
import { FormError } from "@/components/layout/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { createInvestment, updateInvestment } from "@/lib/data/investments";
import { errorMessage } from "@/lib/data/expenses";
import {
  investmentFormSchema,
  ASSET_TYPES,
  TRADE_TYPES,
  type InvestmentFormValues,
} from "@/lib/validations/investment";
import { paiseToRupeesString } from "@/lib/utils/money";
import { todayISO } from "@/lib/utils/dates";
import type { Account, Investment } from "@/types/db";

type Props = {
  open: boolean;
  trade: Investment | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
  notify: (type: "success" | "error", msg: string) => void;
};

export function TradeFormModal({ open, trade, accounts, onClose, onSaved, notify }: Props) {
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<InvestmentFormValues>({
    resolver: zodResolver(investmentFormSchema),
    defaultValues: {
      symbol: "",
      name: "",
      asset_type: "stock",
      trade_type: "buy",
      quantity: "1",
      price: "",
      amount: "",
      current_price: "",
      account_id: "",
      occurred_on: todayISO(),
      note: "",
    },
  });

  const qty = watch("quantity");
  const unitPrice = watch("price");

  // Auto-fill amount when qty and price change if amount is empty or was calculated
  useEffect(() => {
    const q = parseFloat(qty);
    const p = parseFloat(unitPrice);
    if (!isNaN(q) && !isNaN(p) && q > 0 && p >= 0) {
      setValue("amount", (q * p).toFixed(2));
    }
  }, [qty, unitPrice, setValue]);

  useEffect(() => {
    if (open) {
      setError(null);
      if (trade) {
        reset({
          symbol: trade.symbol,
          name: trade.name,
          asset_type: trade.asset_type,
          trade_type: trade.trade_type,
          quantity: String(trade.quantity),
          price: paiseToRupeesString(trade.price_paise),
          amount: paiseToRupeesString(trade.amount_paise),
          current_price: trade.current_price_paise ? paiseToRupeesString(trade.current_price_paise) : "",
          account_id: trade.account_id || "",
          occurred_on: trade.occurred_on,
          note: trade.note || "",
        });
      } else {
        reset({
          symbol: "",
          name: "",
          asset_type: "stock",
          trade_type: "buy",
          quantity: "1",
          price: "",
          amount: "",
          current_price: "",
          account_id: accounts[0]?.id || "",
          occurred_on: todayISO(),
          note: "",
        });
      }
    }
  }, [open, trade, accounts, reset]);

  async function onSubmit(v: InvestmentFormValues) {
    setError(null);
    try {
      const db = createClient();
      if (trade) {
        await updateInvestment(db, trade.id, v);
        notify("success", "Trade updated.");
      } else {
        await createInvestment(db, v);
        notify("success", "Trade recorded.");
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, "Could not save trade."));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={trade ? "Edit trade" : "Record investment / trade"} wide>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Symbol / Ticker" placeholder="e.g. INFY, TCS, GOLD" {...register("symbol")} error={errors.symbol?.message} autoFocus />
          <TextField label="Asset / Company name" placeholder="e.g. Infosys Ltd" {...register("name")} error={errors.name?.message} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Asset type" {...register("asset_type")} error={errors.asset_type?.message}>
            {ASSET_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </SelectField>
          <SelectField label="Trade type" {...register("trade_type")} error={errors.trade_type?.message}>
            {TRADE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </SelectField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Quantity / Units" type="number" step="any" {...register("quantity")} error={errors.quantity?.message} />
          <FieldShell label="Price per unit (₹)" error={errors.price?.message}>
            {(id, d) => (
              <input
                id={id}
                inputMode="decimal"
                placeholder="0.00"
                aria-describedby={d}
                {...register("price")}
                className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm ${errors.price ? "border-red-400" : "border-slate-300"}`}
              />
            )}
          </FieldShell>
          <FieldShell label="Total amount (₹)" error={errors.amount?.message}>
            {(id, d) => (
              <input
                id={id}
                inputMode="decimal"
                placeholder="0.00"
                aria-describedby={d}
                {...register("amount")}
                className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm font-medium ${errors.amount ? "border-red-400" : "border-slate-300"}`}
              />
            )}
          </FieldShell>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FieldShell label="Current market price (₹ optional)" hint="Leave blank if unconfigured" error={errors.current_price?.message}>
            {(id, d) => (
              <input
                id={id}
                inputMode="decimal"
                placeholder="e.g. 1540.00"
                aria-describedby={d}
                {...register("current_price")}
                className={`num h-10 w-full rounded-lg border bg-white px-3 text-sm ${errors.current_price ? "border-red-400" : "border-slate-300"}`}
              />
            )}
          </FieldShell>
          <SelectField label="Account (optional)" {...register("account_id")} error={errors.account_id?.message}>
            <option value="">No account linked</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
            ))}
          </SelectField>
          <TextField label="Date" type="date" {...register("occurred_on")} error={errors.occurred_on?.message} />
        </div>

        <TextField label="Note / Reference (optional)" {...register("note")} error={errors.note?.message} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" loading={isSubmitting}>{trade ? "Save changes" : "Record trade"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
