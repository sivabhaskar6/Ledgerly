import { z } from "zod";
import { parseISODate } from "@/lib/utils/dates";
import { rupeesToPaise } from "@/lib/utils/money";

export const INCOME_SOURCES = [
  { value: "stock_profit", label: "Stock market profit" },
  { value: "fno_trading", label: "F&O trading P&L" },
  { value: "ipo_gain", label: "IPO listing gain" },
  { value: "dividend", label: "Dividend" },
  { value: "interest", label: "Interest" },
  { value: "other", label: "Other income" },
] as const;

export const incomeFormSchema = z.object({
  title: z.string().trim().min(1, "Enter a title").max(120, "Keep the title under 120 characters"),
  source: z.enum(["stock_profit", "fno_trading", "ipo_gain", "dividend", "interest", "other"]),
  occurred_on: z.string().refine((s) => parseISODate(s) !== null, "Enter a valid date"),
  amount: z.string().refine((s) => { try { return rupeesToPaise(s) > 0; } catch { return false; } }, "Enter an amount greater than 0 (up to 2 decimals)"),
  entry_type: z.enum(["profit", "loss"]).optional(),
  note: z.string().max(500, "Keep the note under 500 characters").optional().or(z.literal("")),
});
export type IncomeFormValues = z.infer<typeof incomeFormSchema>;

export const parseIncomeEntryType = (amountPaise: number): "profit" | "loss" =>
  amountPaise < 0 ? "loss" : "profit";

export const toIncomeRow = (v: IncomeFormValues) => {
  const absPaise = rupeesToPaise(v.amount);
  const isLoss = v.entry_type === "loss";
  return {
    title: v.title.trim(),
    source: v.source,
    occurred_on: v.occurred_on,
    amount_paise: isLoss ? -absPaise : absPaise,
    note: v.note?.trim() ? v.note.trim() : null,
  };
};
