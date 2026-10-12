import { z } from "zod";
import { rupeesToPaise } from "@/lib/utils/money";
import { parseISODate } from "@/lib/utils/dates";

export const ACCOUNT_TYPES = [
  { value: "bank", label: "Bank Account" },
  { value: "cash", label: "Cash in Hand" },
  { value: "brokerage", label: "Brokerage / Demat" },
] as const;

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, "Enter an account name").max(80, "Keep the name under 80 characters"),
  type: z.enum(["cash", "bank", "brokerage"], { message: "Select an account type" }),
  opening_balance: z.string().trim().refine((s) => {
    if (!s) return true; // defaults to 0
    try {
      rupeesToPaise(s);
      return true;
    } catch {
      return false;
    }
  }, "Enter a valid opening balance (e.g. 5000.00)"),
  opening_date: z.string().trim().refine((s) => !s || parseISODate(s) !== null, "Invalid date"),
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;

export function toAccountRow(v: AccountFormValues) {
  return {
    name: v.name.trim(),
    type: v.type,
    opening_balance_paise: v.opening_balance ? rupeesToPaise(v.opening_balance) : 0,
    opening_date: v.opening_date || null,
  };
}

export const transferFormSchema = z.object({
  from_account_id: z.string().min(1, "Select the source account"),
  to_account_id: z.string().min(1, "Select the destination account"),
  amount: z.string().trim().min(1, "Enter a transfer amount").refine((s) => {
    try {
      return rupeesToPaise(s) > 0;
    } catch {
      return false;
    }
  }, "Enter a valid positive amount"),
  occurred_on: z.string().trim().refine((s) => parseISODate(s) !== null, "Enter a valid date"),
  note: z.string().max(500, "Note must be under 500 characters").optional(),
}).refine((data) => data.from_account_id !== data.to_account_id, {
  message: "Source and destination accounts must be different",
  path: ["to_account_id"],
});

export type TransferFormValues = z.infer<typeof transferFormSchema>;

export function toTransferRow(v: TransferFormValues) {
  return {
    from_account_id: v.from_account_id,
    to_account_id: v.to_account_id,
    amount_paise: rupeesToPaise(v.amount),
    occurred_on: v.occurred_on,
    note: v.note?.trim() || null,
  };
}
