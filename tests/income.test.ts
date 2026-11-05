import { describe, expect, it } from "vitest";
import {
  incomeFormSchema,
  toIncomeRow,
  parseIncomeEntryType,
} from "@/lib/validations/income";
import { computeFnoPnl, toFnoRow } from "@/lib/validations/fno";
import { isIpoIncome, parseIpoFromIncome } from "@/lib/data/ipo";

describe("Income calculations, validations, and F&O P&L sync", () => {
  it("converts a regular profit entry to positive integer paise", () => {
    const parsed = incomeFormSchema.parse({
      title: "Dividend from ITC",
      source: "dividend",
      occurred_on: "2026-11-04",
      amount: "1500.50",
      entry_type: "profit",
      note: "Quarterly interim dividend",
    });

    const row = toIncomeRow(parsed);
    expect(row.title).toBe("Dividend from ITC");
    expect(row.amount_paise).toBe(150050); // +₹1,500.50
    expect(row.amount_paise).toBeGreaterThan(0);
    expect(parseIncomeEntryType(row.amount_paise)).toBe("profit");
  });

  it("converts a loss entry to negative integer paise for income deduction", () => {
    const parsed = incomeFormSchema.parse({
      title: "Intraday stoploss hit",
      source: "fno_trading",
      occurred_on: "2026-11-04",
      amount: "2500.00",
      entry_type: "loss",
      note: "Hit trailing stoploss",
    });

    const row = toIncomeRow(parsed);
    expect(row.title).toBe("Intraday stoploss hit");
    expect(row.amount_paise).toBe(-250000); // -₹2,500.00
    expect(row.amount_paise).toBeLessThan(0);
    expect(parseIncomeEntryType(row.amount_paise)).toBe("loss");
  });

  it("accurately adds F&O profit to this month's income", () => {
    // Regular income: ₹20,000 (2000000 paise)
    const baseMonthIncomePaise = 2000000;

    // F&O Profit trade: Bought NIFTY Call at 100, sold at 150, qty 50, charges 40
    // Gross: 2500, Charges: 40, Net: +2460 (246000 paise)
    const pnl = computeFnoPnl({
      quantity: 50,
      buyPricePaise: 10000,
      sellPricePaise: 15000,
      chargesPaise: 4000,
    });

    expect(pnl.netPnlPaise).toBe(246000);

    const updatedMonthIncomePaise = baseMonthIncomePaise + pnl.netPnlPaise;
    // 20,000 + 2,460 = ₹22,460 (2246000 paise)
    expect(updatedMonthIncomePaise).toBe(2246000);
    expect(updatedMonthIncomePaise).toBeGreaterThan(baseMonthIncomePaise);
  });

  it("accurately deducts F&O loss from this month's income", () => {
    // Base month income: ₹20,000 (2000000 paise)
    const baseMonthIncomePaise = 2000000;

    // F&O Loss trade: Bought BANKNIFTY Put at 150, sold at 100, qty 30, charges 50
    // Gross: (100 - 150) * 30 = -1500, Charges: 50, Net: -1550 (-155000 paise)
    const pnl = computeFnoPnl({
      quantity: 30,
      buyPricePaise: 15000,
      sellPricePaise: 10000,
      chargesPaise: 5000,
    });

    expect(pnl.netPnlPaise).toBe(-155000);

    const updatedMonthIncomePaise = baseMonthIncomePaise + pnl.netPnlPaise;
    // 20,000 - 1,550 = ₹18,450 (1845000 paise)
    expect(updatedMonthIncomePaise).toBe(1845000);
    expect(updatedMonthIncomePaise).toBeLessThan(baseMonthIncomePaise);
  });

  it("accurately calculates net month income and money left when combining multiple profits and losses", () => {
    const salaryPaise = 5000000; // ₹50,000
    const fnoTrade1ProfitPaise = 1200000; // +₹12,000
    const fnoTrade2LossPaise = -450000; // -₹4,500
    const fnoTrade3LossPaise = -150000; // -₹1,500
    const monthExpensesPaise = 2800000; // ₹28,000

    const totalMonthIncomePaise =
      salaryPaise +
      fnoTrade1ProfitPaise +
      fnoTrade2LossPaise +
      fnoTrade3LossPaise;

    // 50,000 + 12,000 - 4,500 - 1,500 = 56,000 (5600000 paise)
    expect(totalMonthIncomePaise).toBe(5600000);

    // Left this month (income - expenses)
    // 56,000 - 28,000 = 28,000 (2800000 paise)
    const leftThisMonthPaise = totalMonthIncomePaise - monthExpensesPaise;
    expect(leftThisMonthPaise).toBe(2800000);
  });

  it("handles net negative monthly income when trading losses exceed all other income", () => {
    const otherIncomePaise = 500000; // ₹5,000
    const fnoHugeLossPaise = -1200000; // -₹12,000
    const monthExpensesPaise = 1500000; // ₹15,000

    const totalMonthIncomePaise = otherIncomePaise + fnoHugeLossPaise;
    // 5,000 - 12,000 = -7,000 (-700000 paise)
    expect(totalMonthIncomePaise).toBe(-700000);
    expect(totalMonthIncomePaise).toBeLessThan(0);

    // Left this month: -7,000 - 15,000 = -22,000 (-2200000 paise)
    const leftThisMonthPaise = totalMonthIncomePaise - monthExpensesPaise;
    expect(leftThisMonthPaise).toBe(-2200000);
  });

  it("automatically prepares IPO listing data when an IPO entry is created in Income", () => {
    const incomeEntry = {
      title: "TATATECH IPO Listing Pop",
      source: "ipo_gain",
      amount_paise: 3500000, // +₹35,000
      note: "50 shares allotted",
    };

    expect(isIpoIncome(incomeEntry)).toBe(true);

    const ipoData = parseIpoFromIncome(
      incomeEntry.title,
      incomeEntry.amount_paise,
      incomeEntry.note
    );

    expect(ipoData.symbol).toBe("TATATECH");
    expect(ipoData.quantity).toBe(50);
    expect(ipoData.soldPricePaise).toBe(70000); // 35000 / 50 = 700 / sh
  });
});
