import { describe, expect, it } from "vitest";
import {
  fnoFormSchema,
  computeFnoPnl,
  toFnoRow,
} from "@/lib/validations/fno";

describe("F&O validations and P&L calculations", () => {
  it("calculates profit on Call option correctly with charges deducted", () => {
    // Bought at ₹100, Sold at ₹150, Qty: 50, Charges: ₹40
    // Buy turnover = 100 * 50 = ₹5,000 (500000 paise)
    // Sell turnover = 150 * 50 = ₹7,500 (750000 paise)
    // Gross P&L = ₹2,500 (250000 paise)
    // Net P&L = 2500 - 40 = ₹2,460 (246000 paise)
    const pnl = computeFnoPnl({
      quantity: 50,
      buyPricePaise: 10000,
      sellPricePaise: 15000,
      chargesPaise: 4000,
    });

    expect(pnl.buyTurnoverPaise).toBe(500000);
    expect(pnl.sellTurnoverPaise).toBe(750000);
    expect(pnl.grossPnlPaise).toBe(250000);
    expect(pnl.netPnlPaise).toBe(246000);
    expect(pnl.roiPct).toBe(49.2); // (2460 / 5000) * 100 = 49.2%
  });

  it("calculates loss on Put option correctly with charges added to loss", () => {
    // Bought at ₹80, Sold at ₹50, Qty: 50, Charges: ₹40
    // Buy turnover = 80 * 50 = ₹4,000 (400000 paise)
    // Sell turnover = 50 * 50 = ₹2,500 (250000 paise)
    // Gross P&L = -₹1,500 (-150000 paise)
    // Net P&L = -1500 - 40 = -₹1,540 (-154000 paise)
    const pnl = computeFnoPnl({
      quantity: 50,
      buyPricePaise: 8000,
      sellPricePaise: 5000,
      chargesPaise: 4000,
    });

    expect(pnl.grossPnlPaise).toBe(-150000);
    expect(pnl.netPnlPaise).toBe(-154000);
    expect(pnl.roiPct).toBe(-38.5);
  });

  it("validates and converts valid Call trade to database row in integer paise", () => {
    const valid = fnoFormSchema.parse({
      symbol: "nifty",
      instrument_type: "call",
      strike_price: "24500",
      trade_type: "buy_first",
      quantity: "50",
      buy_price: "110.50",
      sell_price: "155.00",
      charges: "45.00",
      occurred_on: "2026-11-03",
      note: "Morning breakout trade",
    });

    const row = toFnoRow(valid);
    expect(row.symbol).toBe("NIFTY");
    expect(row.instrument_type).toBe("call");
    expect(row.strike_price_paise).toBe(2450000);
    expect(row.quantity).toBe(50);
    expect(row.buy_price_paise).toBe(11050);
    expect(row.sell_price_paise).toBe(15500);
    expect(row.charges_paise).toBe(4500);

    // Gross: (155 - 110.5) * 50 = 44.5 * 50 = 2225 (222500 paise)
    // Net: 2225 - 45 = 2180 (218000 paise)
    expect(row.gross_pnl_paise).toBe(222500);
    expect(row.net_pnl_paise).toBe(218000);
    expect(row.note).toBe("Morning breakout trade");
  });

  it("permits futures trade without strike price", () => {
    const valid = fnoFormSchema.parse({
      symbol: "banknifty",
      instrument_type: "future",
      trade_type: "buy_first",
      quantity: "30",
      buy_price: "52000.00",
      sell_price: "52150.00",
      charges: "100.00",
      occurred_on: "2026-11-03",
    });

    const row = toFnoRow(valid);
    expect(row.symbol).toBe("BANKNIFTY");
    expect(row.instrument_type).toBe("future");
    expect(row.strike_price_paise).toBeNull();
    // Gross: (52150 - 52000) * 30 = 150 * 30 = 4500 (450000 paise)
    // Net: 4500 - 100 = 4400 (440000 paise)
    expect(row.gross_pnl_paise).toBe(450000);
    expect(row.net_pnl_paise).toBe(440000);
  });

  it("requires strike price when instrument is call or put", () => {
    const result = fnoFormSchema.safeParse({
      symbol: "NIFTY",
      instrument_type: "call",
      strike_price: "", // missing strike for call option
      trade_type: "buy_first",
      quantity: "50",
      buy_price: "100",
      sell_price: "120",
      occurred_on: "2026-11-03",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid quantities or negative prices", () => {
    expect(
      fnoFormSchema.safeParse({
        symbol: "NIFTY",
        instrument_type: "call",
        strike_price: "24500",
        trade_type: "buy_first",
        quantity: "0",
        buy_price: "100",
        sell_price: "120",
        occurred_on: "2026-11-03",
      }).success
    ).toBe(false);

    expect(
      fnoFormSchema.safeParse({
        symbol: "NIFTY",
        instrument_type: "put",
        strike_price: "24500",
        trade_type: "buy_first",
        quantity: "50",
        buy_price: "-10",
        sell_price: "120",
        occurred_on: "2026-11-03",
      }).success
    ).toBe(false);
  });

  it("produces correct positive P&L to add to income on profitable trades", () => {
    const trade = toFnoRow({
      symbol: "NIFTY",
      instrument_type: "call",
      strike_price: "25000",
      trade_type: "buy_first",
      quantity: "50",
      buy_price: "100.00",
      sell_price: "160.00",
      charges: "40.00",
      occurred_on: "2026-11-04",
    });

    // Gross: (160 - 100) * 50 = 3000
    // Net: 3000 - 40 = 2960 (296000 paise)
    expect(trade.net_pnl_paise).toBe(296000);
    expect(trade.net_pnl_paise).toBeGreaterThan(0);
  });

  it("produces correct negative P&L to reduce income on losing trades", () => {
    const trade = toFnoRow({
      symbol: "BANKNIFTY",
      instrument_type: "put",
      strike_price: "52000",
      trade_type: "buy_first",
      quantity: "30",
      buy_price: "200.00",
      sell_price: "120.00",
      charges: "50.00",
      occurred_on: "2026-11-04",
    });

    // Gross: (120 - 200) * 30 = -2400
    // Net: -2400 - 50 = -2450 (-245000 paise)
    expect(trade.net_pnl_paise).toBe(-245000);
    expect(trade.net_pnl_paise).toBeLessThan(0);
  });
});

