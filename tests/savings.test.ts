import { describe, expect, it, vi } from "vitest";
import { fetchSavingsSummary } from "@/lib/data/savings";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("Savings Data Layer & Monthly Aggregations", () => {
  it("computes monthly net savings and cumulative carry-over accurately", async () => {
    // Scenario from user:
    // October 2026: Earned 25,000, spent 15,000 -> Saved +10,000
    // November 2026: Earned 10,000, spent 15,000 -> Deficit -5,000
    // Cumulative till November = 10,000 - 5,000 = +5,000!

    const mockTransactions = [
      { occurred_on: "2026-10-15", amount_paise: 1500000 }, // 15k expense
      { occurred_on: "2026-11-05", amount_paise: 1500000 }, // 15k expense
    ];

    const mockIncome = [
      { id: "inc-1", occurred_on: "2026-10-01", amount_paise: 2500000, source: "salary" }, // 25k income
      { id: "inc-2", occurred_on: "2026-11-01", amount_paise: 1000000, source: "salary" }, // 10k income
    ];

    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockTransactions, error: null }),
              }),
            }),
          };
        }
        if (table === "income") {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: mockIncome, error: null }),
            }),
          };
        }
        if (table === "fno_trades" || table === "ipo_gains") {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }),
    } as unknown as SupabaseClient;

    const summary = await fetchSavingsSummary(mockDb);

    const oct = summary.records.find((r) => r.monthKey === "2026-10");
    const nov = summary.records.find((r) => r.monthKey === "2026-11");

    expect(oct).toBeDefined();
    expect(nov).toBeDefined();

    // Oct: 25,000 - 15,000 = +10,000 (1,000,000 paise)
    expect(oct?.netSavingsPaise).toBe(1000000);
    expect(oct?.cumulativeSavingsPaise).toBe(1000000);

    // Nov: 10,000 - 15,000 = -5,000 (-500,000 paise)
    expect(nov?.netSavingsPaise).toBe(-500000);
    // Cumulative carry-over: 10,000 + (-5,000) = +5,000 (+500,000 paise)
    expect(nov?.cumulativeSavingsPaise).toBe(500000);
  });

  it("reduces savings when expenses increase (e.g. adding 200 expense)", async () => {
    // 10k income, 15k base expenses + 200 extra expense = 15,200 expenses -> net savings = -5,200
    const mockTransactions = [
      { occurred_on: "2026-11-05", amount_paise: 1500000 },
      { occurred_on: "2026-11-06", amount_paise: 20000 }, // 200 INR (20,000 paise)
    ];

    const mockIncome = [
      { id: "inc-1", occurred_on: "2026-11-01", amount_paise: 1000000, source: "salary" },
    ];

    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockTransactions, error: null }),
              }),
            }),
          };
        }
        if (table === "income") {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: mockIncome, error: null }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }),
    } as unknown as SupabaseClient;

    const summary = await fetchSavingsSummary(mockDb);
    const nov = summary.records.find((r) => r.monthKey === "2026-11");

    expect(nov?.expensePaise).toBe(1520000);
    // 10,000 - 15,200 = -5,200 (-520,000 paise)
    expect(nov?.netSavingsPaise).toBe(-520000);
  });

  it("handles F&O trades: today lost 10k, tomorrow gain 5k -> net F&O is -5k and affects savings", async () => {
    // Income: 20,000; Expenses: 5,000
    // F&O: Day 1 lost 10,000 (-1,000,000 paise), Day 2 gained 5,000 (+500,000 paise)
    // Net F&O = -5,000 (-500,000 paise)
    // Month Net Savings = 20,000 - 5,000 + (-5,000) = +10,000
    const mockFno = [
      { occurred_on: "2026-11-10", net_pnl_paise: -1000000 },
      { occurred_on: "2026-11-11", net_pnl_paise: 500000 },
    ];

    const mockTransactions = [
      { occurred_on: "2026-11-05", amount_paise: 500000 }, // 5k expenses
    ];

    const mockIncome = [
      { id: "inc-1", occurred_on: "2026-11-01", amount_paise: 2000000, source: "salary" },
    ];

    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === "fno_trades") {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: mockFno, error: null }),
            }),
          };
        }
        if (table === "transactions") {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockTransactions, error: null }),
              }),
            }),
          };
        }
        if (table === "income") {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: mockIncome, error: null }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }),
    } as unknown as SupabaseClient;

    const summary = await fetchSavingsSummary(mockDb);
    const nov = summary.records.find((r) => r.monthKey === "2026-11");

    expect(nov?.fnoPnlPaise).toBe(-500000);
    expect(nov?.fnoTradeCount).toBe(2);
    // 20,000 - 5,000 + (-5,000) = 10,000 (1,000,000 paise)
    expect(nov?.netSavingsPaise).toBe(1000000);
  });

  it("avoids double-counting when F&O or IPO is mirrored in income table", async () => {
    // Suppose income table has both regular salary AND mirrored F&O / IPO entries
    const mockIncome = [
      { id: "inc-1", occurred_on: "2026-11-01", amount_paise: 3000000, source: "salary" },
      { id: "inc-2", occurred_on: "2026-11-05", amount_paise: 500000, source: "fno_trading", title: "F&O: NIFTY CE" },
      { id: "inc-3", occurred_on: "2026-11-08", amount_paise: 200000, source: "ipo_gain", title: "IPO Listing Gain: TATA" },
    ];

    const mockFno = [{ occurred_on: "2026-11-05", net_pnl_paise: 500000 }];
    const mockIpo = [{ occurred_on: "2026-11-08", net_pnl_paise: 200000 }];

    const mockDb = {
      from: vi.fn((table: string) => {
        if (table === "fno_trades") {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: mockFno, error: null }),
            }),
          };
        }
        if (table === "ipo_gains") {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: mockIpo, error: null }),
            }),
          };
        }
        if (table === "transactions") {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === "income") {
          return {
            select: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: mockIncome, error: null }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        };
      }),
    } as unknown as SupabaseClient;

    const summary = await fetchSavingsSummary(mockDb);
    const nov = summary.records.find((r) => r.monthKey === "2026-11");

    // Regular income should be strictly 30k (not 37k from double-counting F&O and IPO)
    expect(nov?.regularIncomePaise).toBe(3000000);
    expect(nov?.fnoPnlPaise).toBe(500000);
    expect(nov?.ipoPnlPaise).toBe(200000);
    // Net: 30k - 0 + 5k + 2k = 37,000
    expect(nov?.netSavingsPaise).toBe(3700000);
  });
});
