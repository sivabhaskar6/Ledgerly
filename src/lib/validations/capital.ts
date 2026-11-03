import { z } from "zod";
import { rupeesToPaise } from "@/lib/utils/money";
import { parseISODate } from "@/lib/utils/dates";

export type CapitalOperationMode = "add" | "remove" | "set";

export const capitalFormSchema = z.object({
  mode: z.enum(["add", "remove", "set"]),
  amount: z.string().trim().min(1, "Enter an amount").refine((s) => {
    try {
      return rupeesToPaise(s) >= 0;
    } catch {
      return false;
    }
  }, "Enter a valid non-negative amount (e.g. 50000.00)"),
  occurred_on: z.string().trim().refine((s) => parseISODate(s) !== null, "Enter a valid date"),
  note: z.string().max(500, "Note must be under 500 characters").optional(),
});

export type CapitalFormValues = z.infer<typeof capitalFormSchema>;

export function computeCapitalPaise(
  mode: CapitalOperationMode,
  amountStr: string,
  baselineCapitalPaise: number | null
): { resultingPaise: number; changePaise: number } {
  const changePaise = rupeesToPaise(amountStr);
  if (changePaise < 0) {
    throw new Error("Amount must be non-negative.");
  }

  const baseline = baselineCapitalPaise ?? 0;

  if (mode === "add") {
    return {
      resultingPaise: baseline + changePaise,
      changePaise,
    };
  }

  if (mode === "remove") {
    if (changePaise > baseline) {
      throw new Error("Amount to remove cannot exceed existing capital.");
    }
    return {
      resultingPaise: baseline - changePaise,
      changePaise: -changePaise,
    };
  }

  // mode === "set"
  return {
    resultingPaise: changePaise,
    changePaise: baselineCapitalPaise !== null ? changePaise - baselineCapitalPaise : changePaise,
  };
}

export function toCapitalRow(
  v: { mode?: CapitalOperationMode; amount: string; occurred_on: string; note?: string | null },
  baselineCapitalPaise?: number | null
) {
  const mode = v.mode ?? "set";
  const { resultingPaise } = computeCapitalPaise(mode, v.amount, baselineCapitalPaise ?? null);

  return {
    amount_paise: resultingPaise,
    occurred_on: v.occurred_on,
    note: v.note?.trim() || null,
  };
}
