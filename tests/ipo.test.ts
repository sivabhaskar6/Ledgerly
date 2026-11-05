import { describe, it, expect } from "vitest";
import {
  computeIpoPnl,
  toIpoRow,
  ipoFormSchema,
  type IpoFormValues,
} from "@/lib/validations/ipo";
import { makeIpoIncomeTitle, isIpoIncome, parseIpoFromIncome } from "@/lib/data/ipo";
import { rupeesToPaise } from "@/lib/utils/money";

describe("IPO Listing Gain Calculations & Validations", () => {
  it("calculates positive IPO listing pop and net gain accurately in integer paise", () => {
    // 500 shares allotted at ₹500.00, sold at ₹1200.00, charges ₹40.00
    const quantity = 500;
    const issuePricePaise = rupeesToPaise("500.00"); // 50000 paise
    const soldPricePaise = rupeesToPaise("1200.00"); // 120000 paise
    const chargesPaise = rupeesToPaise("40.00"); // 4000 paise

    const res = computeIpoPnl({
      quantity,
      issuePricePaise,
      soldPricePaise,
      chargesPaise,
    });

    // Total invested: 500 * 50,000 = 25,000,000 paise (₹2,50,000.00)
    expect(res.totalInvestedPaise).toBe(25000000);
    // Total sold: 500 * 120,000 = 60,000,000 paise (₹6,00,000.00)
    expect(res.totalSoldPaise).toBe(60000000);
    // Gross P&L: 60,000,000 - 25,000,000 = 35,000,000 paise (+₹3,50,000.00)
    expect(res.grossPnlPaise).toBe(35000000);
    // Net P&L: 35,000,000 - 4,000 = 34,996,000 paise (+₹3,49,960.00)
    expect(res.netPnlPaise).toBe(34996000);
    // ROI % listing pop: (34,996,000 / 25,000,000) * 100 = 139.984% -> rounded to 140.0%
    expect(res.roiPct).toBe(140.0);
  });

  it("calculates IPO discount listing loss and charge deduction accurately", () => {
    // 100 shares allotted at ₹1000.00, sold at ₹850.00, charges ₹30.00
    const quantity = 100;
    const issuePricePaise = rupeesToPaise("1000.00"); // 100000 paise
    const soldPricePaise = rupeesToPaise("850.00"); // 85000 paise
    const chargesPaise = rupeesToPaise("30.00"); // 3000 paise

    const res = computeIpoPnl({
      quantity,
      issuePricePaise,
      soldPricePaise,
      chargesPaise,
    });

    // Total invested: 100 * 100,000 = 10,000,000 paise (₹1,00,000.00)
    expect(res.totalInvestedPaise).toBe(10000000);
    // Total sold: 100 * 85,000 = 8,500,000 paise (₹85,000.00)
    expect(res.totalSoldPaise).toBe(8500000);
    // Gross P&L: 8,500,000 - 10,000,000 = -1,500,000 paise (-₹15,000.00)
    expect(res.grossPnlPaise).toBe(-1500000);
    // Net P&L: -1,500,000 - 3,000 = -1,503,000 paise (-₹15,030.00)
    expect(res.netPnlPaise).toBe(-1503000);
    // ROI % listing discount: (-1,503,000 / 10,000,000) * 100 = -15.03% -> -15.0%
    expect(res.roiPct).toBe(-15.0);
  });

  it("converts form values to database row correctly", () => {
    const values: IpoFormValues = {
      symbol: "bajajhfl",
      name: "Bajaj Housing Finance Ltd",
      quantity: "214",
      issue_price: "70.00",
      sold_price: "165.00",
      charges: "15.00",
      occurred_on: "2024-09-16",
      account_id: "demat-acc-1",
      note: "HNI category allotment",
    };

    const row = toIpoRow(values);

    expect(row.symbol).toBe("BAJAJHFL");
    expect(row.name).toBe("Bajaj Housing Finance Ltd");
    expect(row.quantity).toBe(214);
    expect(row.issue_price_paise).toBe(7000);
    expect(row.sold_price_paise).toBe(16500);
    expect(row.charges_paise).toBe(1500);
    // Gross: (16500 - 7000) * 214 = 9500 * 214 = 2,033,000 paise (₹20,330)
    expect(row.gross_pnl_paise).toBe(2033000);
    // Net: 2,033,000 - 1,500 = 2,031,500 paise (₹20,315)
    expect(row.net_pnl_paise).toBe(2031500);
    expect(row.occurred_on).toBe("2024-09-16");
    expect(row.account_id).toBe("demat-acc-1");
    expect(row.note).toBe("HNI category allotment");
  });

  it("validates IPO form schema constraints", () => {
    const valid = ipoFormSchema.safeParse({
      symbol: "SWIGGY",
      quantity: "38",
      issue_price: "390.00",
      sold_price: "420.00",
      charges: "20.00",
      occurred_on: "2024-11-13",
    });
    expect(valid.success).toBe(true);

    const invalidQty = ipoFormSchema.safeParse({
      symbol: "SWIGGY",
      quantity: "0",
      issue_price: "390.00",
      sold_price: "420.00",
      occurred_on: "2024-11-13",
    });
    expect(invalidQty.success).toBe(false);

    const invalidPrice = ipoFormSchema.safeParse({
      symbol: "SWIGGY",
      quantity: "38",
      issue_price: "-50",
      sold_price: "420.00",
      occurred_on: "2024-11-13",
    });
    expect(invalidPrice.success).toBe(false);
  });

  it("formats income titles for IPO listing gains and losses", () => {
    const gainTitle = makeIpoIncomeTitle({
      symbol: "tatatech",
      net_pnl_paise: 35000000,
    });
    expect(gainTitle).toBe("IPO Listing Gain: TATATECH");

    const lossTitle = makeIpoIncomeTitle({
      symbol: "paytm",
      net_pnl_paise: -1500000,
    });
    expect(lossTitle).toBe("IPO Listing Loss: PAYTM");
  });

  it("identifies IPO income entries accurately", () => {
    expect(isIpoIncome({ source: "ipo_gain", title: "Dividend payout" })).toBe(true);
    expect(isIpoIncome({ source: "stock_profit", title: "Tata Tech IPO" })).toBe(true);
    expect(isIpoIncome({ source: "other", title: "IPO Listing Gain: SWIGGY" })).toBe(true);
    expect(isIpoIncome({ source: "stock_profit", title: "Reliance Industries Sell" })).toBe(false);
    expect(isIpoIncome({ source: "fno_trading", title: "NIFTY CE" })).toBe(false);
  });

  it("parses previously added income records into IPO listing data cleanly", () => {
    // 1. Prefix title: "IPO Listing Gain: TATATECH"
    const p1 = parseIpoFromIncome("IPO Listing Gain: TATATECH", 35000000);
    expect(p1.symbol).toBe("TATATECH");
    expect(p1.soldPricePaise).toBe(35000000);
    expect(p1.quantity).toBe(1);

    // 2. Casual title: "Tata Tech IPO" with note quantity
    const p2 = parseIpoFromIncome("Tata Tech IPO", 1500000, "Allotted 50 shares retail");
    expect(p2.symbol).toBe("TATA TECH");
    expect(p2.name).toBe("Tata Tech IPO");
    expect(p2.quantity).toBe(50);
    // 15,000 / 50 = 300 / share
    expect(p2.soldPricePaise).toBe(30000);

    // 3. Loss entry: "IPO Listing Loss: PAYTM"
    const p3 = parseIpoFromIncome("IPO Listing Loss: PAYTM", -1500000);
    expect(p3.symbol).toBe("PAYTM");
    expect(p3.issuePricePaise).toBe(1500000);
    expect(p3.soldPricePaise).toBe(0);
  });
});
