"use client";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { FieldShell } from "@/components/ui/Field";
import { FormError } from "@/components/layout/AuthShell";
import { createClient } from "@/lib/supabase/client";
import { updateHoldingPrice, type HoldingSummary } from "@/lib/data/investments";
import { errorMessage } from "@/lib/data/expenses";
import { paiseToRupeesString, rupeesToPaise } from "@/lib/utils/money";

type Props = {
  open: boolean;
  holding: HoldingSummary | null;
  onClose: () => void;
  onSaved: () => void;
  notify: (type: "success" | "error", msg: string) => void;
};

export function UpdatePriceModal({ open, holding, onClose, onSaved, notify }: Props) {
  const [priceStr, setPriceStr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && holding) {
      setError(null);
      setPriceStr(holding.currentPricePaise ? paiseToRupeesString(holding.currentPricePaise) : "");
    }
  }, [open, holding]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!holding) return;
    setError(null);
    setSubmitting(true);
    try {
      const paise = rupeesToPaise(priceStr);
      if (paise <= 0) throw new Error("Price must be greater than 0");
      const db = createClient();
      await updateHoldingPrice(db, holding.symbol, paise);
      notify("success", `Updated market price for ${holding.symbol}.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Enter a valid market price (e.g. 1540.50)."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Update market price for ${holding?.symbol ?? ""}`}>
      <form onSubmit={handleSave} className="space-y-4">
        <FormError message={error} />
        <p className="text-xs text-slate-500">
          Set the current per-unit price to calculate unrealized returns for {holding?.name}.
        </p>
        <FieldShell label="Current unit price (₹)">
          {(id) => (
            <input
              id={id}
              inputMode="decimal"
              placeholder="0.00"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              className="num h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              autoFocus
            />
          )}
        </FieldShell>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" loading={submitting}>Save price</Button>
        </div>
      </form>
    </Dialog>
  );
}
