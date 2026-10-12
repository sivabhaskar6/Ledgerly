import { z } from "zod";
import { parseISODate } from "@/lib/utils/dates";
import { rupeesToPaise } from "@/lib/utils/money";

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "debit_card", label: "Debit card" },
  { value: "credit_card", label: "Credit card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "other", label: "Other" },
] as const;

export const expenseFormSchema = z.object({
  category_id: z.string().uuid("Choose a category"),
  title: z.string().trim().min(1, "Enter a title").max(120, "Keep the title under 120 characters"),
  occurred_on: z.string().refine((s) => parseISODate(s) !== null, "Enter a valid date"),
  note: z.string().max(500, "Keep the note under 500 characters").optional().or(z.literal("")),
  amount: z.string().refine((s) => {
    try { return rupeesToPaise(s) > 0; } catch { return false; }
  }, "Enter an amount greater than 0 (up to 2 decimals)"),
  account_id: z.string().uuid().optional().or(z.literal("")),
  payment_method: z.enum(["cash", "upi", "debit_card", "credit_card", "bank_transfer", "other"]).optional().or(z.literal("")),
});
export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export function toExpenseRow(v: ExpenseFormValues) {
  return {
    category_id: v.category_id,
    title: v.title.trim(),
    occurred_on: v.occurred_on,
    note: v.note?.trim() ? v.note.trim() : null,
    amount_paise: rupeesToPaise(v.amount),
    account_id: v.account_id || null,
    payment_method: v.payment_method || null,
  };
}
