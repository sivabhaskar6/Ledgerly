import { describe, expect, it } from "vitest";
import { accountFormSchema, transferFormSchema, toAccountRow, toTransferRow } from "@/lib/validations/account";
import { investmentFormSchema, toInvestmentRow } from "@/lib/validations/investment";

describe("account and transfer validations", () => {
  it("validates and converts opening balance to paise", () => {
    const valid = accountFormSchema.parse({
      name: "HDFC Salary",
      type: "bank",
      opening_balance: "10500.50",
      opening_date: "2026-01-01",
    });
    const row = toAccountRow(valid);
    expect(row.opening_balance_paise).toBe(1050050);
    expect(row.name).toBe("HDFC Salary");
  });

  it("prevents transfers between the exact same account", () => {
    const invalid = transferFormSchema.safeParse({
      from_account_id: "acc-1",
      to_account_id: "acc-1",
      amount: "500",
      occurred_on: "2026-10-11",
    });
    expect(invalid.success).toBe(false);
  });

  it("validates inter-account transfer", () => {
    const valid = transferFormSchema.parse({
      from_account_id: "acc-1",
      to_account_id: "acc-2",
      amount: "500.25",
      occurred_on: "2026-10-11",
      note: "ATM withdrawal",
    });
    const row = toTransferRow(valid);
    expect(row.amount_paise).toBe(50025);
    expect(row.from_account_id).toBe("acc-1");
    expect(row.to_account_id).toBe("acc-2");
  });
});

describe("investment trade validations and capital separation", () => {
  it("correctly models stock purchase with paise precision", () => {
    const valid = investmentFormSchema.parse({
      symbol: "TCS",
      name: "Tata Consultancy Services",
      asset_type: "stock",
      trade_type: "buy",
      quantity: "10",
      price: "3500.00",
      amount: "35000.00",
      occurred_on: "2026-10-11",
    });
    const row = toInvestmentRow(valid);
    expect(row.symbol).toBe("TCS");
    expect(row.quantity).toBe(10);
    expect(row.amount_paise).toBe(3500000);
    expect(row.trade_type).toBe("buy");
  });

  it("correctly models IPO application capital movement", () => {
    const valid = investmentFormSchema.parse({
      symbol: "SWIGGY",
      name: "Swiggy IPO",
      asset_type: "ipo",
      trade_type: "ipo_apply",
      quantity: "1",
      price: "14850.00",
      amount: "14850.00",
      occurred_on: "2026-10-11",
    });
    const row = toInvestmentRow(valid);
    expect(row.trade_type).toBe("ipo_apply");
    expect(row.amount_paise).toBe(1485000);
  });
});
