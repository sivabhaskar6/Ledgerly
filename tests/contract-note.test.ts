import { describe, expect, it } from "vitest";
import {
  parseContractDescription,
  normalizeContractDate,
  detectBroker,
  extractChargesSummary,
  parseContractNoteText,
  parseContractNoteRows,
} from "@/lib/data/contractNoteParser";

describe("F&O Contract Note Parser", () => {
  it("normalizes Indian dates in multiple formats", () => {
    expect(normalizeContractDate("19/11/2026")).toBe("2026-11-19");
    expect(normalizeContractDate("19-11-2026")).toBe("2026-11-19");
    expect(normalizeContractDate("2026-11-19")).toBe("2026-11-19");
    expect(normalizeContractDate("19-Nov-2026")).toBe("2026-11-19");
    expect(normalizeContractDate("19 Nov 2026")).toBe("2026-11-19");
    expect(normalizeContractDate("invalid-date")).toBeNull();
  });

  it("accurately parses contract descriptions for NSE, BSE and MCX", () => {
    // 1. NSE Option with CE before strike
    const c1 = parseContractDescription("OPTIDX NIFTY 21NOV2026 CE 24500.00");
    expect(c1.symbol).toBe("NIFTY");
    expect(c1.instrument_type).toBe("call");
    expect(c1.strike_price).toBe("24500");
    expect(c1.segment).toBe("equity");

    // 2. Broker style with strike before CE
    const c2 = parseContractDescription("NIFTY 21NOV24 24500 CE");
    expect(c2.symbol).toBe("NIFTY");
    expect(c2.instrument_type).toBe("call");
    expect(c2.strike_price).toBe("24500");
    expect(c2.segment).toBe("equity");

    // 3. Bank Nifty Put Option
    const c3 = parseContractDescription("OPTIDX BANKNIFTY 27NOV2026 PE 51500.00");
    expect(c3.symbol).toBe("BANKNIFTY");
    expect(c3.instrument_type).toBe("put");
    expect(c3.strike_price).toBe("51500");
    expect(c3.segment).toBe("equity");

    // 4. MCX Commodity Call Option
    const c4 = parseContractDescription("CRUDEOIL 18DEC2026 CE 6200.00");
    expect(c4.symbol).toBe("CRUDEOIL");
    expect(c4.instrument_type).toBe("call");
    expect(c4.strike_price).toBe("6200");
    expect(c4.segment).toBe("commodity");

    // 5. Index Future
    const c5 = parseContractDescription("FUTIDX NIFTY 28-Nov-2024");
    expect(c5.symbol).toBe("NIFTY");
    expect(c5.instrument_type).toBe("future");
    expect(c5.strike_price).toBeNull();
    expect(c5.segment).toBe("equity");

    // 6. Sensex Call Option
    const c6 = parseContractDescription("SENSEX 22NOV24 77500 CE");
    expect(c6.symbol).toBe("SENSEX");
    expect(c6.instrument_type).toBe("call");
    expect(c6.strike_price).toBe("77500");
    expect(c6.segment).toBe("equity");
  });

  it("detects Indian brokers accurately", () => {
    expect(detectBroker("Nextbillion Technology Private Limited GROWW")).toBe("Groww");
    expect(detectBroker("Zerodha Broking Limited Contract Note")).toBe("Zerodha");
    expect(detectBroker("Angel One Limited ECN")).toBe("Angel One");
    expect(detectBroker("Upstox RKSV Securities")).toBe("Upstox");
    expect(detectBroker("Standard National Stock Exchange note")).toBe("SEBI / NSE / BSE Standard");
  });

  it("extracts charges and taxes summary from contract note text", () => {
    const sampleCharges = `
      SUMMARY OF TAXES & CHARGES:
      Brokerage: 120.00
      Securities Transaction Tax (STT): 52.50
      Exchange Transaction Charges: 28.40
      SEBI Turnover Charges: 1.15
      Stamp Duty: 12.00
      GST: 26.72
      Total Charges: 240.77
    `;
    const summary = extractChargesSummary(sampleCharges);
    expect(summary.brokerage).toBe(120.00);
    expect(summary.stt).toBe(52.50);
    expect(summary.exchange).toBe(28.40);
    expect(summary.totalCharges).toBe(240.77);
  });

  it("parses full contract note text and combines buy/sell legs into complete trades", () => {
    const contractNoteText = `
      Nextbillion Technology Private Limited (Groww)
      ELECTRONIC CONTRACT NOTE
      Trade Date: 19/11/2026
      Contract Note Ref: CN-20261119-9821

      Order No. Trade No. Security Description B/S Quantity Price Net Total
      101 201 OPTIDX NIFTY 21NOV2026 CE 24500.00 B 65 110.50 -7182.50
      102 202 OPTIDX NIFTY 21NOV2026 CE 24500.00 S 65 155.00 10075.00
      103 203 OPTIDX BANKNIFTY 27NOV2026 PE 51500.00 B 15 280.00 -4200.00
      104 204 OPTIDX BANKNIFTY 27NOV2026 PE 51500.00 S 15 340.00 5100.00

      Total Charges: 160.00
    `;

    const res = parseContractNoteText(contractNoteText);
    expect(res.success).toBe(true);
    expect(res.broker).toBe("Groww");
    expect(res.tradeDate).toBe("2026-11-19");
    expect(res.trades.length).toBe(2);

    // Trade 1: NIFTY 24500 CE
    const t1 = res.trades.find((t) => t.symbol === "NIFTY");
    expect(t1).toBeDefined();
    expect(t1?.strike_price).toBe("24500");
    expect(t1?.instrument_type).toBe("call");
    expect(t1?.quantity).toBe(65);
    expect(t1?.buy_price).toBe("110.50");
    expect(t1?.sell_price).toBe("155.00");
    // Gross P&L: (155 - 110.50) * 65 = 44.50 * 65 = 2892.50 rupees = 289250 paise
    expect(t1?.gross_pnl_paise).toBe(289250);
    expect(t1?.net_pnl_paise).toBeLessThan(289250); // Net is after charges

    // Trade 2: BANKNIFTY 51500 PE
    const t2 = res.trades.find((t) => t.symbol === "BANKNIFTY");
    expect(t2).toBeDefined();
    expect(t2?.strike_price).toBe("51500");
    expect(t2?.instrument_type).toBe("put");
    expect(t2?.quantity).toBe(15);
    expect(t2?.buy_price).toBe("280.00");
    expect(t2?.sell_price).toBe("340.00");
    // Gross P&L: (340 - 280) * 15 = 60 * 15 = 900 rupees = 90000 paise
    expect(t2?.gross_pnl_paise).toBe(90000);
  });

  it("handles MCX Commodity contracts like Crude Oil correctly", () => {
    const crudeNote = `
      Trade Date: 19-11-2026
      MCX Contract Note
      CRUDEOIL 18DEC2026 CE 6200.00 B 100 240.00
      CRUDEOIL 18DEC2026 CE 6200.00 S 100 232.50
      Total Charges: 82.96
    `;

    const res = parseContractNoteText(crudeNote);
    expect(res.success).toBe(true);
    expect(res.trades.length).toBe(1);
    const t = res.trades[0]!;
    expect(t.symbol).toBe("CRUDEOIL");
    expect(t.segment).toBe("commodity");
    expect(t.quantity).toBe(100);
    expect(t.buy_price).toBe("240.00");
    expect(t.sell_price).toBe("232.50");
    // Loss: (232.50 - 240.00) * 100 = -750 rupees = -75000 paise
    expect(t.gross_pnl_paise).toBe(-75000);
    expect(t.net_pnl_paise).toBeLessThan(-75000);
  });

  it("correctly computes weighted average prices for partial order fills", () => {
    const partialFills = [
      { symbol: "NIFTY26NOV24500CE", trade_date: "19-11-2026", trade_type: "buy", quantity: "30", price: "100.00" },
      { symbol: "NIFTY26NOV24500CE", trade_date: "19-11-2026", trade_type: "buy", quantity: "35", price: "120.00" },
      { symbol: "NIFTY26NOV24500CE", trade_date: "19-11-2026", trade_type: "sell", quantity: "65", price: "155.00" },
    ];

    const res = parseContractNoteRows(partialFills);
    expect(res.success).toBe(true);
    expect(res.trades.length).toBe(1);
    const t = res.trades[0]!;
    expect(t.quantity).toBe(65);
    // Weighted avg buy price: (30 * 100 + 35 * 120) / 65 = (3000 + 4200) / 65 = 7200 / 65 = 110.77
    expect(t.buy_price).toBe("110.77");
    expect(t.sell_price).toBe("155.00");
    // Gross P&L: 65 * 155 - 7200 = 10075 - 7200 = 2875 rupees = 287500 paise
    expect(t.gross_pnl_paise).toBe(287500);
  });

  it("handles empty or invalid content gracefully", () => {
    const emptyRes = parseContractNoteText("");
    expect(emptyRes.success).toBe(false);
    expect(emptyRes.trades.length).toBe(0);

    const emptyRowsRes = parseContractNoteRows([]);
    expect(emptyRowsRes.success).toBe(false);
    expect(emptyRowsRes.trades.length).toBe(0);
  });

  it("parses Groww Sensex contract note Annexure A with separate executed trades", () => {
    const growwSensexNoteText = `
Unique Client Code 9170270005 Name Gonthina Siva Bhaskar
Client GSTIN NA Mobile Number 9346631439
PAN OPHPS8716B Trading/Backoffice Code 9170270005
State of Supply ANDHRA PRADESH
Contract Note no. CN/27/0154939249
Trade Date 19-11-2026
Settlement Date 20-11-2026

FUTURE & OPTIONS
Security/Contract Description Buy(B)/Sell(S)/BF/CF Quantity WAP per Unit (Rs) Brokerage per Unit (Rs) WAP per Unit after brokerage (Rs) Net Total (before levies) (Rs)
NSE SENSEX 81800 CE 19 Nov 2026 Buy 120 359.93 0.3333 360.26 -43231.00
NSE SENSEX 81800 CE 19 Nov 2026 Sell -120 387.60 0.3333 387.27 46472.00
NSE SENSEX 82000 PE 19 Nov 2026 Buy 60 316.00 0.3333 316.33 -18980.00
NSE SENSEX 82000 PE 19 Nov 2026 Sell -60 327.15 0.3333 326.82 19609.00
NSE SENSEX 82200 CE 19 Nov 2026 Buy 60 298.70 0.3333 299.03 -17942.00
NSE SENSEX 82200 CE 19 Nov 2026 Sell -60 313.30 0.3333 312.97 18778.00

-- 2 of 3 --
Description Equity Future & Options Net Total
Settlement Number 2026219
Pay In / Pay Out Obligation (before Brokerage) 4866.00 4866.00
Taxable Value of Supply (Brokerage) -160.00 -160.00
Exchange Transaction Charges -53.63 -53.63
CGST (9% on Brokerage, Exchange transaction charges, SEBI turnover fees and IPFT charges) 0.00 0.00
SGST (9% on Brokerage, Exchange transaction charges, SEBI turnover fees and IPFT charges) 0.00 0.00
IGST (18% on Brokerage, Exchange transaction charges, SEBI turnover fees and IPFT charges) -38.48 -38.48
Securities Transaction Tax -127.00 -127.00
SEBI Turnover Fees -0.16 -0.16
Stamp Duty -2.00 -2.00
Net Amount Receivable / Payable By Client 4484.73 4484.73
Yours faithfully,
For Groww Invest Tech Private Limited

-- 3 of 3 --
Annexure A
FUTURE & OPTIONS
Order no. Order time Trade no. Trade time Security/Contract description Exchange Buy(B)/Sell(S) Quantity Gross Rate/Trade Price Per unit (Rs) Net Rate per Unit (Rs) Net Total (Before Levies) (Rs) Remarks
1795061416990050
642 09:40:23 8780230 09:40:23 SENSEX 81800 CE 19 Nov 2026 BSE B 60 320.80 320.80 -19248.00
1795061416990689
146 09:41:37 9225670 09:41:37 SENSEX 81800 CE 19 Nov 2026 BSE S -60 356.95 356.95 21417.00
1795061637311671
709 09:45:40 9859840 09:45:40 SENSEX 81800 CE 19 Nov 2026 BSE B 60 399.05 399.05 -23943.00
1795061769480096
876 09:46:22 10003060 09:46:22 SENSEX 81800 CE 19 Nov 2026 BSE S -60 418.25 418.25 25095.00
Total SENSEX 81800 CE 19 Nov 2026 0 3321.00
1795060614761354
330 09:27:32 8974430 09:27:37 SENSEX 82000 PE 19 Nov 2026 BSE B 60 316.00 316.00 -18960.00
1795060614761721
209 09:28:14 9273310 09:28:14 SENSEX 82000 PE 19 Nov 2026 BSE S -60 327.15 327.15 19629.00
Total SENSEX 82000 PE 19 Nov 2026 0 669.00
1795069089096013
964 11:48:11 43097540 11:48:11 SENSEX 82200 CE 19 Nov 2026 BSE B 60 298.70 298.70 -17922.00
1795069089096293
955 11:49:05 43275390 11:49:05 SENSEX 82200 CE 19 Nov 2026 BSE S -40 313.35 313.35 12534.00
1795069089096293
955 11:49:05 43275410 11:49:05 SENSEX 82200 CE 19 Nov 2026 BSE S -20 313.20 313.20 6264.00
Total SENSEX 82200 CE 19 Nov 2026 0 876.00
Net Total 4866.00
    `;

    const charges = extractChargesSummary(growwSensexNoteText);
    expect(charges.brokerage).toBe(160);
    expect(charges.stt).toBe(127);
    expect(charges.exchange).toBe(53.63);
    expect(charges.gst).toBe(38.48);
    expect(charges.totalCharges).toBeCloseTo(381.27, 2);

    const res = parseContractNoteText(growwSensexNoteText);
    expect(res.success).toBe(true);
    expect(res.broker).toBe("Groww");
    expect(res.tradeDate).toBe("2026-11-19");
    expect(res.trades.length).toBe(4);
    expect(res.totalGrossPnlPaise).toBe(486600); // Rs 4,866.00
    expect(res.totalNetPnlPaise).toBe(448473); // Rs 4,484.73

    // Trade 1: SENSEX 82000 PE
    const t1 = res.trades[0]!;
    expect(t1.symbol).toBe("SENSEX");
    expect(t1.strike_price).toBe("82000");
    expect(t1.instrument_type).toBe("put");
    expect(t1.quantity).toBe(60);
    expect(t1.buy_price).toBe("316.00");
    expect(t1.sell_price).toBe("327.15");
    expect(t1.gross_pnl_paise).toBe(66900); // +Rs 669.00

    // Trade 2: SENSEX 81800 CE (#1)
    const t2 = res.trades[1]!;
    expect(t2.symbol).toBe("SENSEX");
    expect(t2.strike_price).toBe("81800");
    expect(t2.instrument_type).toBe("call");
    expect(t2.quantity).toBe(60);
    expect(t2.buy_price).toBe("320.80");
    expect(t2.sell_price).toBe("356.95");
    expect(t2.gross_pnl_paise).toBe(216900); // +Rs 2,169.00

    // Trade 3: SENSEX 81800 CE (#2)
    const t3 = res.trades[2]!;
    expect(t3.symbol).toBe("SENSEX");
    expect(t3.strike_price).toBe("81800");
    expect(t3.instrument_type).toBe("call");
    expect(t3.quantity).toBe(60);
    expect(t3.buy_price).toBe("399.05");
    expect(t3.sell_price).toBe("418.25");
    expect(t3.gross_pnl_paise).toBe(115200); // +Rs 1,152.00

    // Trade 4: SENSEX 82200 CE
    const t4 = res.trades[3]!;
    expect(t4.symbol).toBe("SENSEX");
    expect(t4.strike_price).toBe("82200");
    expect(t4.instrument_type).toBe("call");
    expect(t4.quantity).toBe(60);
    expect(t4.buy_price).toBe("298.70");
    expect(t4.sell_price).toBe("313.30"); // Weighted average of 40 @ 313.35 and 20 @ 313.20
    expect(t4.gross_pnl_paise).toBe(87600); // +Rs 876.00
  });
});
