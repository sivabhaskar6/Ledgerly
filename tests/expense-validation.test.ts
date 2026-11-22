import { describe, expect, it } from "vitest";
import { expenseFormSchema, toExpenseRow } from "@/lib/validations/expense";
import { sanitizeSearch } from "@/lib/data/expenses";
import { parseISODate, presetRange } from "@/lib/utils/dates";

const base = { category_id: "7b0f3a52-0c1c-4a54-9a8e-3a4c2f6f1b11", title: "Lunch", occurred_on: "2026-10-11", amount: "120.50", note: "", account_id: "", payment_method: "" as const };

describe("expense validation", () => {
  it("accepts a valid expense and maps to paise", () => {
    const v = expenseFormSchema.parse(base);
    expect(toExpenseRow(v)).toMatchObject({ amount_paise: 12050, note: null, account_id: null, payment_method: null });
  });
  it("rejects zero, blank title and bad dates", () => {
    expect(expenseFormSchema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...base, occurred_on: "2026-02-30" }).success).toBe(false);
    expect(expenseFormSchema.safeParse({ ...base, category_id: "" }).success).toBe(false);
  });
});

describe("dates and search", () => {
  it("validates ISO dates strictly", () => {
    expect(parseISODate("2026-02-28")).not.toBeNull();
    expect(parseISODate("2026-02-30")).toBeNull();
    expect(parseISODate("11/10/2026")).toBeNull();
  });
  it("builds preset ranges including Indian Financial Year", () => {
    const now = new Date(2026, 9, 11);
    expect(presetRange("today", now)).toEqual({ from: "2026-10-11", to: "2026-10-11" });
    expect(presetRange("month", now)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("year", now)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(presetRange("week", now).from).toBe("2026-10-05");
    // Indian FY: Oct 2026 is in FY 2026-27 (2026-04-01 to 2027-03-31)
    expect(presetRange("fy", now)).toEqual({ from: "2026-04-01", to: "2027-03-31" });
    // Date before April: Feb 2026 is in FY 2025-26 (2025-04-01 to 2026-03-31)
    const earlyYear = new Date(2026, 1, 15);
    expect(presetRange("fy", earlyYear)).toEqual({ from: "2025-04-01", to: "2026-03-31" });
  });
  it("sanitizes search input for PostgREST filters", () => {
    expect(sanitizeSearch("a,b(c)")).toBe("a b c");
    expect(sanitizeSearch("50%_off")).toBe("50\\%\\_off");
  });
});

import { incomeFormSchema, toIncomeRow } from "@/lib/validations/income";
describe("income validation", () => {
  const v = { title: "Sold shares", source: "stock_profit" as const, occurred_on: "2026-10-11", amount: "2500.75", note: "" };
  it("maps a valid entry to paise", () => { expect(toIncomeRow(incomeFormSchema.parse(v))).toMatchObject({ amount_paise: 250075, note: null }); });
  it("rejects zero amounts and unknown sources", () => {
    expect(incomeFormSchema.safeParse({ ...v, amount: "0" }).success).toBe(false);
    expect(incomeFormSchema.safeParse({ ...v, source: "salary" }).success).toBe(false);
  });
});
