import { z } from "zod";
import { rupeesToPaise } from "@/lib/utils/money";
import { parseISODate } from "@/lib/utils/dates";

export const POPULAR_IPOS = [
  "TATATECH",
  "BAJAJHFL",
  "SWIGGY",
  "HYUNDAI",
  "ZOMATO",
  "LIC",
  "IRFC",
  "IREDA",
  "MANKIND",
  "KAYNES",
] as const;

export const ipoFormSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1, "Enter company name or stock symbol (e.g. TATATECH, BAJAJHFL)")
    .max(50, "Symbol/Name is too long")
    .transform((s) => s.toUpperCase()),
  name: z
    .string()
    .trim()
    .max(100, "Company name is too long")
    .optional(),
  quantity: z
    .string()
    .trim()
    .min(1, "Enter allotted shares quantity")
    .refine((s) => {
      const n = parseInt(s, 10);
      return !isNaN(n) && n > 0 && String(n) === s;
    }, "Quantity must be a positive whole number (e.g. 500, 100, 15)"),
  issue_price: z
    .string()
    .trim()
    .min(1, "Enter allotment / issue price per share")
    .refine((s) => {
      try {
        return rupeesToPaise(s) >= 0;
      } catch {
        return false;
      }
    }, "Enter a valid issue price (e.g. 500.00)"),
  sold_price: z
    .string()
    .trim()
    .min(1, "Enter sold / listing price per share")
    .refine((s) => {
      try {
        return rupeesToPaise(s) >= 0;
      } catch {
        return false;
      }
    }, "Enter a valid sold price (e.g. 1200.00)"),
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
    }, "Enter valid charges/taxes (e.g. 40.00)"),
  occurred_on: z
    .string()
    .trim()
    .refine((s) => parseISODate(s) !== null, "Enter a valid listing/sale date"),
  account_id: z.string().trim().optional(),
  note: z.string().max(500, "Note must be under 500 characters").optional(),
});

export type IpoFormValues = z.infer<typeof ipoFormSchema>;

export function computeIpoPnl(params: {
  quantity: number;
  issuePricePaise: number;
  soldPricePaise: number;
  chargesPaise: number;
}): {
  totalInvestedPaise: number;
  totalSoldPaise: number;
  grossPnlPaise: number;
  netPnlPaise: number;
  roiPct: number | null;
} {
  const { quantity, issuePricePaise, soldPricePaise, chargesPaise } = params;
  const totalInvestedPaise = issuePricePaise * quantity;
  const totalSoldPaise = soldPricePaise * quantity;
  const grossPnlPaise = totalSoldPaise - totalInvestedPaise;
  const netPnlPaise = grossPnlPaise - chargesPaise;

  let roiPct: number | null = null;
  if (totalInvestedPaise > 0) {
    roiPct = Math.round((netPnlPaise / totalInvestedPaise) * 1000) / 10;
  }

  return {
    totalInvestedPaise,
    totalSoldPaise,
    grossPnlPaise,
    netPnlPaise,
    roiPct,
  };
}

export function toIpoRow(v: IpoFormValues) {
  const qty = parseInt(v.quantity, 10);
  const issuePricePaise = rupeesToPaise(v.issue_price);
  const soldPricePaise = rupeesToPaise(v.sold_price);
  const chargesPaise = v.charges && v.charges.trim() ? rupeesToPaise(v.charges) : 0;

  const { grossPnlPaise, netPnlPaise } = computeIpoPnl({
    quantity: qty,
    issuePricePaise,
    soldPricePaise,
    chargesPaise,
  });

  return {
    symbol: v.symbol.trim().toUpperCase(),
    name: v.name?.trim() || null,
    quantity: qty,
    issue_price_paise: issuePricePaise,
    sold_price_paise: soldPricePaise,
    charges_paise: chargesPaise,
    gross_pnl_paise: grossPnlPaise,
    net_pnl_paise: netPnlPaise,
    occurred_on: v.occurred_on,
    account_id: v.account_id && v.account_id.trim() ? v.account_id : null,
    note: v.note?.trim() || null,
  };
}
