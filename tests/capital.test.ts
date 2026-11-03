import { describe, expect, it } from "vitest";
import {
  capitalFormSchema,
  toCapitalRow,
  computeCapitalPaise,
} from "@/lib/validations/capital";

describe("capital validations", () => {
  it("validates and maps capital amount to integer paise", () => {
    const valid = capitalFormSchema.parse({
      mode: "set",
      amount: "1500000.50",
      occurred_on: "2026-10-12",
      note: "Total liquid + fixed savings snapshot",
    });
    const row = toCapitalRow(valid);
    expect(row.amount_paise).toBe(150000050);
    expect(row.occurred_on).toBe("2026-10-12");
    expect(row.note).toBe("Total liquid + fixed savings snapshot");
  });

  it("handles optional note and trims whitespace", () => {
    const valid = capitalFormSchema.parse({
      mode: "set",
      amount: "50000",
      occurred_on: "2026-10-12",
      note: "   ",
    });
    const row = toCapitalRow(valid);
    expect(row.amount_paise).toBe(5000000);
    expect(row.note).toBeNull();
  });

  it("rejects negative amount or invalid dates", () => {
    expect(capitalFormSchema.safeParse({
      mode: "set",
      amount: "-100",
      occurred_on: "2026-10-12",
    }).success).toBe(false);

    expect(capitalFormSchema.safeParse({
      mode: "set",
      amount: "1000",
      occurred_on: "invalid-date",
    }).success).toBe(false);
  });

  it("correctly computes adding to baseline capital for new entry or editing", () => {
    // Baseline capital before entry: ₹1,60,000 (16000000 paise). Add: ₹50,000 (5000000 paise). Result: ₹2,10,000.
    const res = computeCapitalPaise("add", "50000", 16000000);
    expect(res.resultingPaise).toBe(21000000);
    expect(res.changePaise).toBe(5000000);

    const row = toCapitalRow(
      {
        mode: "add",
        amount: "50000",
        occurred_on: "2026-10-12",
        note: "Bonus capital added",
      },
      16000000
    );
    expect(row.amount_paise).toBe(21000000);
    expect(row.note).toBe("Bonus capital added");
  });

  it("correctly computes removing from baseline capital for new entry or editing", () => {
    // Baseline capital before entry: ₹1,60,000 (16000000 paise). Remove: ₹20,000 (2000000 paise). Result: ₹1,40,000.
    const res = computeCapitalPaise("remove", "20000", 16000000);
    expect(res.resultingPaise).toBe(14000000);
    expect(res.changePaise).toBe(-2000000);

    const row = toCapitalRow(
      {
        mode: "remove",
        amount: "20000",
        occurred_on: "2026-10-12",
      },
      16000000
    );
    expect(row.amount_paise).toBe(14000000);
  });

  it("prevents removing more than baseline capital", () => {
    // Baseline capital: ₹50,000. Attempt to remove: ₹60,000.
    expect(() => computeCapitalPaise("remove", "60000", 5000000)).toThrow(
      "Amount to remove cannot exceed existing capital."
    );
  });

  it("supports setting exact total capital directly", () => {
    const res = computeCapitalPaise("set", "180000", 16000000);
    expect(res.resultingPaise).toBe(18000000);

    const row = toCapitalRow(
      {
        mode: "set",
        amount: "180000",
        occurred_on: "2026-10-12",
        note: "Updated bank savings",
      },
      16000000
    );
    expect(row.amount_paise).toBe(18000000);
    expect(row.note).toBe("Updated bank savings");
  });
});
