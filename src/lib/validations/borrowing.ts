import { z } from "zod";
import { rupeesToPaise } from "@/lib/utils/money";

export const borrowFormSchema = z.object({
  person_name: z
    .string()
    .trim()
    .min(1, "Enter person name (e.g. Ramesh, Priya)")
    .max(100, "Name is too long"),
  type: z.enum(["lent", "borrowed"]),
  amount: z
    .string()
    .trim()
    .min(1, "Enter amount in ₹")
    .refine((s) => {
      try {
        return rupeesToPaise(s) > 0;
      } catch {
        return false;
      }
    }, "Enter a valid amount greater than ₹0"),
  occurred_on: z
    .string()
    .trim()
    .min(1, "Enter date")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  due_date: z
    .string()
    .trim()
    .optional()
    .or(z.literal("")),
  status: z.enum(["pending", "settled"]),
  settled_on: z
    .string()
    .trim()
    .optional()
    .or(z.literal("")),
  account_id: z
    .string()
    .trim()
    .optional()
    .or(z.literal("")),
  note: z
    .string()
    .trim()
    .max(500, "Note must be 500 characters or fewer")
    .optional()
    .or(z.literal("")),
});

export type BorrowFormValues = z.infer<typeof borrowFormSchema>;
