import { z } from "zod";
import { rupeesToPaise } from "@/lib/utils/money";
import { parseISODate } from "@/lib/utils/dates";
import type { AssetType, TradeType } from "@/types/db";

export const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: "stock", label: "Equity / Stock" },
  { value: "mutual_fund", label: "Mutual Fund" },
  { value: "etf", label: "ETF" },
  { value: "ipo", label: "IPO Application" },
  { value: "other", label: "Other Asset" },
];

export const TRADE_TYPES: { value: TradeType; label: string }[] = [
  { value: "buy", label: "Buy / Purchase" },
  { value: "sell", label: "Sell / Exit" },
  { value: "ipo_apply", label: "IPO Application (Capital Blocked)" },
  { value: "ipo_allotment", label: "IPO Shares Allotted" },
  { value: "ipo_refund", label: "IPO Refund (Capital Unblocked)" },
];

export const investmentFormSchema = z.object({
  symbol: z.string().trim().min(1, "Enter a ticker/symbol (e.g. TCS)").max(30),
  name: z.string().trim().min(1, "Enter asset or company name").max(120),
  asset_type: z.enum(["stock", "etf", "mutual_fund", "ipo", "other"]),
  trade_type: z.enum(["buy", "sell", "ipo_apply", "ipo_allotment", "ipo_refund"]),
  quantity: z.string().trim().refine((s) => {
    const n = parseFloat(s);
    return !isNaN(n) && n >= 0;
  }, "Quantity must be 0 or greater"),
  price: z.string().trim().refine((s) => {
    if (!s) return true;
    try {
      return rupeesToPaise(s) >= 0;
    } catch {
      return false;
    }
  }, "Enter a valid unit price"),
  amount: z.string().trim().refine((s) => {
    try {
      return rupeesToPaise(s) >= 0;
    } catch {
      return false;
    }
  }, "Enter a valid total amount"),
  current_price: z.string().trim().refine((s) => {
    if (!s) return true;
    try {
      return rupeesToPaise(s) >= 0;
    } catch {
      return false;
    }
  }, "Enter a valid current market price or leave blank").optional(),
  account_id: z.string().optional(),
  occurred_on: z.string().trim().refine((s) => parseISODate(s) !== null, "Enter a valid date"),
  note: z.string().max(500, "Note must be under 500 characters").optional(),
});

export type InvestmentFormValues = z.infer<typeof investmentFormSchema>;

export function toInvestmentRow(v: InvestmentFormValues) {
  return {
    symbol: v.symbol.trim().toUpperCase(),
    name: v.name.trim(),
    asset_type: v.asset_type,
    trade_type: v.trade_type,
    quantity: parseFloat(v.quantity) || 0,
    price_paise: v.price ? rupeesToPaise(v.price) : 0,
    amount_paise: rupeesToPaise(v.amount),
    current_price_paise: v.current_price ? rupeesToPaise(v.current_price) : null,
    account_id: v.account_id || null,
    occurred_on: v.occurred_on,
    note: v.note?.trim() || null,
  };
}
