import { z } from "zod";
import { rupeesToPaise } from "@/lib/utils/money";
import { parseISODate } from "@/lib/utils/dates";
import type { FnoInstrumentType, FnoTradeType, FnoSegment } from "@/types/db";

export const FNO_INSTRUMENTS = [
  { value: "call", label: "Call (CE)", color: "emerald" },
  { value: "put", label: "Put (PE)", color: "rose" },
  { value: "future", label: "Future (FUT)", color: "brand" },
] as const;

export const FNO_SEGMENTS = [
  { value: "equity", label: "Equity / Index F&O", sub: "NSE / BSE (Nifty, Sensex...)" },
  { value: "commodity", label: "Commodities", sub: "MCX (Crude Oil, Natural Gas...)" },
] as const;

export const POPULAR_EQUITY_SYMBOLS = [
  "NIFTY",
  "BANKNIFTY",
  "FINNIFTY",
  "MIDCPNIFTY",
  "SENSEX",
  "BANKEX",
  "RELIANCE",
  "HDFCBANK",
] as const;

export const POPULAR_COMMODITY_SYMBOLS = [
  "CRUDEOIL",
  "NATURALGAS",
  "GOLD",
  "SILVER",
  "COPPER",
  "ZINC",
] as const;

// Backward-compatible alias
export const POPULAR_FNO_SYMBOLS = POPULAR_EQUITY_SYMBOLS;

/**
 * Standard Lot Sizes in Indian Markets (NSE / BSE / MCX).
 * NIFTY: 65 (revised NSE lot size)
 * SENSEX: 20
 * CRUDEOIL: 100 (barrels)
 */
export const DEFAULT_LOT_SIZES: Record<string, number> = {
  // Equity & Indexes
  NIFTY: 65,
  BANKNIFTY: 15,
  FINNIFTY: 25,
  MIDCPNIFTY: 50,
  SENSEX: 20,
  BANKEX: 15,
  RELIANCE: 250,
  TCS: 175,
  HDFCBANK: 550,
  INFY: 400,
  ICICIBANK: 700,

  // Commodities (MCX)
  CRUDEOIL: 100,
  CRUDEOILM: 10,
  NATURALGAS: 1250,
  NATURALGASM: 250,
  GOLD: 100,
  GOLDM: 10,
  SILVER: 30,
  SILVERM: 5,
  SILVERMIC: 1,
  COPPER: 2500,
  ZINC: 5000,
  ALUMINIUM: 5000,
  LEAD: 5000,
};

export function isCommoditySymbol(symbol: string): boolean {
  const sym = (symbol || "").trim().toUpperCase();
  return (
    (POPULAR_COMMODITY_SYMBOLS as readonly string[]).includes(sym) ||
    sym.startsWith("CRUDE") ||
    sym.startsWith("NATURAL") ||
    sym.startsWith("GOLD") ||
    sym.startsWith("SILVER") ||
    sym.startsWith("COPPER") ||
    sym.startsWith("ZINC") ||
    sym.startsWith("ALUM") ||
    sym.startsWith("LEAD") ||
    sym.startsWith("MCX")
  );
}

export function resolveFnoSegment(
  symbol: string,
  explicitSegment?: string | null
): "equity" | "commodity" {
  if (isCommoditySymbol(symbol)) return "commodity";
  if (explicitSegment === "commodity") return "commodity";
  return "equity";
}

export function getDefaultLotSize(symbol: string, segment: "equity" | "commodity"): number {
  const clean = symbol.trim().toUpperCase();
  if (DEFAULT_LOT_SIZES[clean]) return DEFAULT_LOT_SIZES[clean];
  const actualSeg = resolveFnoSegment(clean, segment);
  return actualSeg === "commodity" ? 100 : 65;
}

export const fnoFormSchema = z
  .object({
    segment: z.enum(["equity", "commodity"]),
    symbol: z
      .string()
      .trim()
      .min(1, "Enter symbol / index (e.g. NIFTY, CRUDEOIL)")
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
    lots: z
      .string()
      .trim()
      .optional()
      .refine((s) => {
        if (!s || s.trim() === "") return true;
        const n = parseInt(s, 10);
        return !isNaN(n) && n > 0 && String(n) === s;
      }, "Lots must be a positive whole number (e.g. 1, 2, 5)"),
    lot_size: z
      .string()
      .trim()
      .optional()
      .refine((s) => {
        if (!s || s.trim() === "") return true;
        const n = parseInt(s, 10);
        return !isNaN(n) && n > 0 && String(n) === s;
      }, "Lot size must be a positive whole number (e.g. 65, 20, 100)"),
    quantity: z
      .string()
      .trim()
      .optional()
      .refine((s) => {
        if (!s || s.trim() === "") return true;
        const n = parseInt(s, 10);
        return !isNaN(n) && n > 0;
      }, "Quantity must be greater than 0"),
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

export type GrowwChargesBreakdown = {
  brokeragePaise: number;
  sttCttPaise: number;
  exchangeFeePaise: number;
  ipftPaise: number;
  stampDutyPaise: number;
  sebiFeePaise: number;
  gstPaise: number;
  totalChargesPaise: number;
  totalChargesRupees: number;
};

/**
 * Calculates Groww official charges & regulatory taxes for F&O and Commodity trades.
 * Fully aligned with latest Groww pricing policy:
 * - Brokerage: Flat ₹20 per executed order leg (₹40 round-trip for Buy + Sell)
 * - STT (Securities Transaction Tax):
 *     - Equity Options: 0.15% on options sell premium turnover
 *     - Equity Futures: 0.02% on futures sell turnover
 * - CTT (Commodity Transaction Tax):
 *     - Commodity Options (MCX): 0.05% on options sell premium turnover
 *     - Commodity Futures (MCX): 0.01% on futures sell turnover
 * - Exchange Turnover Fees:
 *     - NSE Equity Options: 0.03503% on premium turnover
 *     - BSE Equity Options: 0.0325% on premium turnover (Sensex/Bankex)
 *     - Equity Futures: 0.00173% on turnover
 *     - MCX Commodity Options: 0.0418% on option premium turnover
 *     - MCX Commodity Futures: 0.0021% on turnover
 * - IPFT (Investor Protection Fund Trust):
 *     - Equity Options / Futures (NSE/BSE): 0.0005% (₹0.50 per lakh) on turnover
 *     - MCX Commodities: 0.0001% (₹0.10 per lakh) on turnover
 * - Stamp Duty:
 *     - Options: 0.003% on buy premium turnover
 *     - Futures: 0.002% on buy turnover
 * - SEBI Turnover Fee: ₹10 per crore (0.0001% of total turnover)
 * - GST: 18% on (Brokerage + Exchange Fees + IPFT + SEBI Turnover Fee)
 */
export function calculateGrowwCharges(params: {
  segment: "equity" | "commodity";
  instrumentType: "call" | "put" | "future";
  quantity: number;
  buyPriceRupees: number;
  sellPriceRupees: number;
  symbol?: string;
}): GrowwChargesBreakdown {
  const { segment, instrumentType, quantity, buyPriceRupees, sellPriceRupees, symbol } =
    params;

  const actualSegment = resolveFnoSegment(symbol || "", segment);

  if (quantity <= 0 || (buyPriceRupees <= 0 && sellPriceRupees <= 0)) {
    return {
      brokeragePaise: 0,
      sttCttPaise: 0,
      exchangeFeePaise: 0,
      ipftPaise: 0,
      stampDutyPaise: 0,
      sebiFeePaise: 0,
      gstPaise: 0,
      totalChargesPaise: 0,
      totalChargesRupees: 0,
    };
  }

  const buyTurnover = Math.max(0, buyPriceRupees * quantity);
  const sellTurnover = Math.max(0, sellPriceRupees * quantity);
  const totalTurnover = buyTurnover + sellTurnover;

  // 1. Brokerage: Flat ₹20 per executed leg on Groww
  const brokerage =
    (buyPriceRupees > 0 ? 20 : 0) + (sellPriceRupees > 0 ? 20 : 0);

  // 2. STT / CTT (Levied on Sell Side)
  let sttCtt = 0;
  if (actualSegment === "equity") {
    if (instrumentType === "future") {
      sttCtt = sellTurnover * 0.0002; // 0.02%
    } else {
      sttCtt = sellTurnover * 0.0015; // 0.15% on options sell premium turnover
    }
  } else {
    // Commodity (MCX)
    if (instrumentType === "future") {
      sttCtt = sellTurnover * 0.0001; // 0.01%
    } else {
      sttCtt = sellTurnover * 0.0005; // 0.05% on commodity options
    }
  }

  // 3. Exchange Transaction Charges
  const sym = symbol ? symbol.toUpperCase() : "";
  const isBse = sym === "SENSEX" || sym === "BANKEX";
  let exchangeFee = 0;
  if (actualSegment === "equity") {
    if (instrumentType === "future") {
      exchangeFee = totalTurnover * 0.0000173; // 0.00173%
    } else if (isBse) {
      exchangeFee = totalTurnover * 0.000325; // 0.0325% BSE
    } else {
      exchangeFee = totalTurnover * 0.0003503; // 0.03503% NSE
    }
  } else {
    // MCX
    if (instrumentType === "future") {
      exchangeFee = totalTurnover * 0.000021; // 0.0021%
    } else {
      exchangeFee = totalTurnover * 0.000418; // 0.0418% MCX option
    }
  }

  // 4. IPFT (Investor Protection Fund Trust: 0.0005% on NSE/BSE, 0.0001% on MCX)
  let ipftFee = 0;
  if (actualSegment === "equity") {
    ipftFee = totalTurnover * 0.000005; // 0.0005%
  } else {
    ipftFee = totalTurnover * 0.000001; // 0.0001%
  }

  // 5. Stamp Duty (Buy side only)
  let stampDuty = 0;
  if (instrumentType === "future") {
    stampDuty = buyTurnover * 0.00002; // 0.002%
  } else {
    stampDuty = buyTurnover * 0.00003; // 0.003%
  }

  // 6. SEBI Turnover Charges (₹10 / crore = 0.0001% on total turnover)
  const sebiFee = totalTurnover * 0.000001;

  // 7. GST (18% on Brokerage + Exchange Fee + IPFT + SEBI Fee)
  const gst = (brokerage + exchangeFee + ipftFee + sebiFee) * 0.18;

  const totalChargesRupees =
    brokerage + sttCtt + exchangeFee + ipftFee + stampDuty + sebiFee + gst;

  return {
    brokeragePaise: Math.round(brokerage * 100),
    sttCttPaise: Math.round(sttCtt * 100),
    exchangeFeePaise: Math.round(exchangeFee * 100),
    ipftPaise: Math.round(ipftFee * 100),
    stampDutyPaise: Math.round(stampDuty * 100),
    sebiFeePaise: Math.round(sebiFee * 100),
    gstPaise: Math.round(gst * 100),
    totalChargesPaise: Math.round(totalChargesRupees * 100),
    totalChargesRupees: Math.round(totalChargesRupees * 100) / 100,
  };
}

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

export function toFnoRow(
  v: Omit<FnoFormValues, "segment"> & { segment?: "equity" | "commodity" }
) {
  let qty = 1;
  let lots = 1;
  let lotSize = 1;

  if (v.lots && v.lot_size) {
    const l = parseInt(v.lots, 10);
    const ls = parseInt(v.lot_size, 10);
    if (!isNaN(l) && l > 0 && !isNaN(ls) && ls > 0) {
      lots = l;
      lotSize = ls;
      qty = lots * lotSize;
    } else if (v.quantity) {
      qty = parseInt(v.quantity, 10) || 1;
      lots = 1;
      lotSize = qty;
    }
  } else if (v.quantity) {
    qty = parseInt(v.quantity, 10) || 1;
    const defaultLs = getDefaultLotSize(v.symbol, v.segment || "equity");
    if (qty >= defaultLs && qty % defaultLs === 0) {
      lots = qty / defaultLs;
      lotSize = defaultLs;
    } else {
      lots = 1;
      lotSize = qty;
    }
  } else if (v.lots) {
    lots = parseInt(v.lots, 10) || 1;
    lotSize = getDefaultLotSize(v.symbol, v.segment || "equity");
    qty = lots * lotSize;
  }

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

  const effectiveSegment = resolveFnoSegment(v.symbol, v.segment);

  return {
    symbol: v.symbol.trim().toUpperCase(),
    instrument_type: v.instrument_type as FnoInstrumentType,
    strike_price_paise: strikePricePaise,
    expiry_date: v.expiry_date?.trim() || null,
    trade_type: v.trade_type as FnoTradeType,
    quantity: qty,
    lots,
    lot_size: lotSize,
    segment: effectiveSegment as FnoSegment,
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
