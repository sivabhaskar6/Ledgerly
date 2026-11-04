import { z } from "zod";
import { rupeesToPaise } from "@/lib/utils/money";
import { parseISODate } from "@/lib/utils/dates";
import type { FnoInstrumentType, FnoTradeType } from "@/types/db";

export const FNO_INSTRUMENTS = [
  { value: "call", label: "Call (CE)", color: "emerald" },
  { value: "put", label: "Put (PE)", color: "rose" },
  { value: "future", label: "Future (FUT)", color: "brand" },
] as const;

export const POPULAR_FNO_SYMBOLS = [
  "NIFTY",
  "BANKNIFTY",
  "FINNIFTY",
  "MIDCPNIFTY",
  "SENSEX",
  "RELIANCE",
  "HDFCBANK",
  "TCS",
  "INFY",
  "ICICIBANK",
] as const;

export const fnoFormSchema = z
  .object({
    symbol: z
      .string()
      .trim()
      .min(1, "Enter symbol / index (e.g. NIFTY, BANKNIFTY)")
      .max(20, "Symbol is too long")
      .transform((s) => s.toUpperCase()),
    instrument_type: z.enum(["call", "put", "future"]),
    strike_price: z
      .string()
      .trim()
      .optional()
      .refine((s) => {
        if (!s || s.trim() === "") return true;
        try {
          return rupeesToPaise(s) >= 0;
        } catch {
          return false;
        }
      }, "Enter a valid strike price (e.g. 24500)"),
    expiry_date: z
      .string()
      .trim()
      .optional()
      .refine((s) => {
        if (!s || s.trim() === "") return true;
        return parseISODate(s) !== null;
      }, "Enter a valid expiry date"),
    trade_type: z.enum(["buy_first", "sell_first"]),
    quantity: z
      .string()
      .trim()
      .min(1, "Enter quantity / lot size")
      .refine((s) => {
        const n = parseInt(s, 10);
        return !isNaN(n) && n > 0 && String(n) === s;
      }, "Quantity must be a positive whole number (e.g. 50, 75, 25)"),
    buy_price: z
      .string()
      .trim()
      .min(1, "Enter buy price")
      .refine((s) => {
        try {
          return rupeesToPaise(s) >= 0;
        } catch {
          return false;
        }
      }, "Enter a valid buy price (e.g. 120.50)"),
    sell_price: z
      .string()
      .trim()
      .min(1, "Enter sell price")
      .refine((s) => {
        try {
          return rupeesToPaise(s) >= 0;
        } catch {
          return false;
        }
      }, "Enter a valid sell price (e.g. 165.00)"),
    charges: z
      .string()
      .trim()
      .optional()
      .refine((s) => {
        if (!s || s.trim() === "") return true;
        try {
          return rupeesToPaise(s) >= 0;
        } catch {
          return false;
        }
      }, "Enter valid charges (e.g. 40.00)"),
    occurred_on: z
      .string()
      .trim()
      .refine((s) => parseISODate(s) !== null, "Enter a valid trade date"),
    account_id: z.string().trim().optional(),
    note: z.string().max(500, "Note must be under 500 characters").optional(),
  })
  .refine(
    (data) => {
      if (data.instrument_type !== "future") {
        return !!data.strike_price && data.strike_price.trim().length > 0;
      }
      return true;
    },
    {
      message: "Strike price is required for Call and Put options",
      path: ["strike_price"],
    }
  );

export type FnoFormValues = z.infer<typeof fnoFormSchema>;

export function computeFnoPnl(params: {
  quantity: number;
  buyPricePaise: number;
  sellPricePaise: number;
  chargesPaise: number;
}): {
  grossPnlPaise: number;
  netPnlPaise: number;
  buyTurnoverPaise: number;
  sellTurnoverPaise: number;
  roiPct: number | null;
} {
  const { quantity, buyPricePaise, sellPricePaise, chargesPaise } = params;
  const buyTurnoverPaise = buyPricePaise * quantity;
  const sellTurnoverPaise = sellPricePaise * quantity;
  const grossPnlPaise = sellTurnoverPaise - buyTurnoverPaise;
  const netPnlPaise = grossPnlPaise - chargesPaise;

  let roiPct: number | null = null;
  if (buyTurnoverPaise > 0) {
    roiPct = Math.round((netPnlPaise / buyTurnoverPaise) * 1000) / 10;
  }

  return {
    grossPnlPaise,
    netPnlPaise,
    buyTurnoverPaise,
    sellTurnoverPaise,
    roiPct,
  };
}

export function toFnoRow(v: FnoFormValues) {
  const qty = parseInt(v.quantity, 10);
  const buyPricePaise = rupeesToPaise(v.buy_price);
  const sellPricePaise = rupeesToPaise(v.sell_price);
  const chargesPaise = v.charges && v.charges.trim() ? rupeesToPaise(v.charges) : 0;
  const strikePricePaise =
    v.strike_price && v.strike_price.trim() ? rupeesToPaise(v.strike_price) : null;

  const { grossPnlPaise, netPnlPaise } = computeFnoPnl({
    quantity: qty,
    buyPricePaise,
    sellPricePaise,
    chargesPaise,
  });

  return {
    symbol: v.symbol.trim().toUpperCase(),
    instrument_type: v.instrument_type as FnoInstrumentType,
    strike_price_paise: strikePricePaise,
    expiry_date: v.expiry_date?.trim() || null,
    trade_type: v.trade_type as FnoTradeType,
    quantity: qty,
    buy_price_paise: buyPricePaise,
    sell_price_paise: sellPricePaise,
    charges_paise: chargesPaise,
    gross_pnl_paise: grossPnlPaise,
    net_pnl_paise: netPnlPaise,
    occurred_on: v.occurred_on,
    account_id: v.account_id && v.account_id.trim() ? v.account_id : null,
    note: v.note?.trim() || null,
  };
}
