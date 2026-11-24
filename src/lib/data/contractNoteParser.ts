import { rupeesToPaise } from "@/lib/utils/money";
import { todayISO, parseISODate } from "@/lib/utils/dates";
import {
  resolveFnoSegment,
  getDefaultLotSize,
  calculateGrowwCharges,
} from "@/lib/validations/fno";
import type { FnoInstrumentType, FnoTradeType, FnoSegment } from "@/types/db";

export type RawTradeExecution = {
  rawDescription: string;
  symbol: string;
  segment: FnoSegment;
  instrument_type: FnoInstrumentType;
  strike_price: string | null;
  expiry: string | null;
  side: "BUY" | "SELL";
  quantity: number;
  price: number; // in rupees
  time?: string;
  orderTime?: string;
  tradeTime?: string;
  tradeNo?: string;
  orderNo?: string;
};

export type ParsedFnoTrade = {
  id: string; // temporary client uuid
  selected: boolean;
  symbol: string;
  segment: FnoSegment;
  instrument_type: FnoInstrumentType;
  strike_price: string;
  strike_price_paise: number | null;
  expiry_date: string | null;
  trade_type: FnoTradeType;
  lots: number;
  lot_size: number;
  quantity: number;
  buy_price: string;
  buy_price_paise: number;
  sell_price: string;
  sell_price_paise: number;
  charges: string;
  charges_paise: number;
  gross_pnl_paise: number;
  net_pnl_paise: number;
  occurred_on: string;
  note: string;
  rawDescription?: string;
};

export type ParsedContractNoteResult = {
  success: boolean;
  broker: string;
  tradeDate: string;
  trades: ParsedFnoTrade[];
  totalTrades: number;
  totalGrossPnlPaise: number;
  totalChargesPaise: number;
  totalNetPnlPaise: number;
  warnings: string[];
  contractNoteNumber?: string;
};

/**
 * Standard Indian indices and equities traded in F&O
 */
const KNOWN_FNO_SYMBOLS = [
  "BANKNIFTY",
  "FINNIFTY",
  "MIDCPNIFTY",
  "BANKEX",
  "SENSEX",
  "NIFTY",
  "CRUDEOILM",
  "CRUDEOIL",
  "NATURALGASM",
  "NATURALGAS",
  "GOLDM",
  "GOLD",
  "SILVERMIC",
  "SILVERM",
  "SILVER",
  "COPPER",
  "ZINC",
  "ALUMINIUM",
  "LEAD",
  "RELIANCE",
  "HDFCBANK",
  "TCS",
  "INFY",
  "ICICIBANK",
  "SBIN",
  "BHARTIARTL",
  "KOTAKBANK",
  "LT",
  "TATAMOTORS",
  "AXISBANK",
  "BAJFINANCE",
  "MARUTI",
  "ITC",
] as const;

/**
 * Normalizes diverse Indian date strings (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, 19-Nov-2026) to ISO YYYY-MM-DD
 */
export function normalizeContractDate(val: string): string | null {
  if (!val) return null;
  const str = val.trim();
  if (parseISODate(str)) return str;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    let y = yRaw!;
    if (y.length === 2) y = `20${y}`;
    const iso = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    if (parseISODate(iso)) return iso;
  }

  // DD-MMM-YYYY (e.g. 19-Nov-2026 or 19 Nov 2026)
  const dMmmY = str.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2,4})$/);
  if (dMmmY) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const [, d, mStr, yRaw] = dMmmY;
    const m = months[mStr!.toLowerCase()];
    if (m) {
      let y = yRaw!;
      if (y.length === 2) y = `20${y}`;
      const iso = `${y}-${m}-${d!.padStart(2, "0")}`;
      if (parseISODate(iso)) return iso;
    }
  }

  return null;
}

/**
 * Parses contract details from descriptions like:
 * - "OPTIDX NIFTY 21NOV2026 CE 24500.00"
 * - "NIFTY 21NOV24 24500 CE"
 * - "BANKNIFTY 27NOV24 51500 PE"
 * - "CRUDEOIL 18DEC24 6200 CE"
 * - "FUTIDX NIFTY 28-Nov-2024"
 * - "NIFTY24NOV24500CE"
 */
export function parseContractDescription(desc: string): {
  symbol: string;
  segment: "equity" | "commodity";
  instrument_type: FnoInstrumentType;
  strike_price: string | null;
  expiry: string | null;
} {
  const clean = desc.trim().toUpperCase().replace(/\s+/g, " ");

  // 1. Segment
  let segment: "equity" | "commodity" = "equity";
  if (/CRUDE|NATURAL|GOLD|SILVER|COPPER|ZINC|ALUM|LEAD|MCX/.test(clean)) {
    segment = "commodity";
  }

  // 2. Instrument Type
  let instrument_type: FnoInstrumentType = "call";
  if (/\b(PE|PUT)\b/i.test(clean) || /PE$|PUT$/i.test(clean)) {
    instrument_type = "put";
  } else if (
    /\b(FUT|FUTURES?)\b/i.test(clean) ||
    clean.startsWith("FUTIDX") ||
    clean.startsWith("FUTSTK") ||
    /FUT$/i.test(clean)
  ) {
    instrument_type = "future";
  } else {
    instrument_type = "call";
  }

  // 3. Symbol
  let symbol = "NIFTY";
  for (const s of KNOWN_FNO_SYMBOLS) {
    if (clean.includes(s)) {
      symbol = s;
      break;
    }
  }

  // 4. Expiry extraction & stripping to avoid collision with strike numbers
  let expiry: string | null = null;
  const expiryMatch =
    clean.match(/\b(\d{1,2}[-/][A-Za-z]{3}[-/]\d{2,4})\b/) ||
    clean.match(/\b(\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4})\b/) ||
    clean.match(/\b(\d{1,2}[A-Za-z]{3}(?:\d{2}|\d{4}))\b/);
  if (expiryMatch) {
    expiry = expiryMatch[1]!;
  }

  let strikeSearchStr = clean;
  if (expiryMatch) {
    strikeSearchStr = strikeSearchStr.replace(expiryMatch[0], " ");
  }

  // 5. Strike Price
  let strike_price: string | null = null;
  if (instrument_type !== "future") {
    const afterMatch = strikeSearchStr.match(/(?:CE|PE|CALL|PUT)\s*[:=-]?\s*(\d+(?:\.\d{1,2})?)\b/);
    const beforeMatch = strikeSearchStr.match(/(\d+(?:\.\d{1,2})?)\s*(?:CE|PE|CALL|PUT)\b/);
    const compactMatch = clean.match(/\b[A-Z]+\d{2}[A-Z]{3}(\d{4,6})(?:CE|PE)/);

    if (afterMatch && parseFloat(afterMatch[1]!) > 20) {
      strike_price = String(Math.floor(parseFloat(afterMatch[1]!)));
    } else if (beforeMatch && parseFloat(beforeMatch[1]!) > 20) {
      strike_price = String(Math.floor(parseFloat(beforeMatch[1]!)));
    } else if (compactMatch) {
      strike_price = compactMatch[1]!;
    } else {
      const anyStrike = strikeSearchStr.match(/\b(\d{4,6})\b/);
      if (anyStrike) strike_price = anyStrike[1]!;
    }
  }

  return {
    symbol,
    segment: resolveFnoSegment(symbol, segment),
    instrument_type,
    strike_price,
    expiry,
  };
}

/**
 * Detects Indian broker from contract note headers or metadata
 */
export function detectBroker(text: string): string {
  if (/Groww|Nextbillion Technology/i.test(text)) return "Groww";
  if (/Zerodha Broking/i.test(text)) return "Zerodha";
  if (/Angel One|Angel Broking/i.test(text)) return "Angel One";
  if (/RKSV|Upstox/i.test(text)) return "Upstox";
  if (/Moneylicious|Dhan/i.test(text)) return "Dhan";
  if (/Kotak Securities/i.test(text)) return "Kotak Securities";
  if (/ICICI Securities/i.test(text)) return "ICICI Direct";
  if (/Motilal Oswal/i.test(text)) return "Motilal Oswal";
  if (/HDFC Securities/i.test(text)) return "HDFC Sky";
  return "SEBI / NSE / BSE Standard";
}

/**
 * Extracts overall charges & taxes summary from contract note text if present
 */
export function extractChargesSummary(text: string): {
  brokerage: number;
  stt: number;
  exchange: number;
  gst: number;
  sebi: number;
  stamp: number;
  totalCharges: number;
} {
  const getAmt = (patterns: RegExp[]): number => {
    for (const p of patterns) {
      const m = text.match(p);
      if (m && m[1]) {
        const val = parseFloat(m[1].replace(/,/g, ""));
        if (!isNaN(val)) return Math.abs(val);
      }
    }
    return 0;
  };

  const brokerage = getAmt([
    /(?:Taxable\s*Value\s*of\s*Supply\s*\(Brokerage\)|Total\s*Brokerage|Brokerage)[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
    /Brokerage[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
  ]);

  const stt = getAmt([
    /(?:Securities\s*Transaction\s*Tax|Commodities\s*Transaction\s*Tax|STT|CTT)(?:\s*\([^)]*\))?[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
    /STT[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
    /CTT[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
  ]);

  const exchange = getAmt([
    /Exchange\s*(?:Transaction|Turnover)\s*(?:Charges|Fees)[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
    /Txn\s*Charges[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
  ]);

  const cgst = getAmt([
    /\bCGST(?:\s*\([^)]*\))?[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
  ]);
  const sgst = getAmt([
    /\bSGST(?:\s*\([^)]*\))?[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
  ]);
  const igst = getAmt([
    /\bIGST(?:\s*\([^)]*\))?[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
  ]);
  const generalGst = getAmt([
    /(?:Total\s*GST|GST)(?:\s*\([^)]*\))?[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
  ]);
  const gst = cgst + sgst > 0 ? cgst + sgst : igst > 0 ? igst : generalGst;

  const sebi = getAmt([
    /SEBI\s*(?:Turnover|Regulatory)\s*(?:Charges|Fees)[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
  ]);

  const stamp = getAmt([
    /Stamp\s*Duty[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
  ]);

  let totalCharges = getAmt([
    /Total\s*(?:Taxes\s*&?\s*Charges|Charges|Levies)[:\s]+(?:Rs\.?|₹)?\s*-?([0-9,]+\.[0-9]{2})/i,
  ]);

  const sumOfParts = brokerage + stt + exchange + gst + sebi + stamp;
  if (totalCharges === 0 && sumOfParts > 0) {
    totalCharges = sumOfParts;
  }

  return {
    brokerage,
    stt,
    exchange,
    gst,
    sebi,
    stamp,
    totalCharges,
  };
}

/**
 * Extracts raw trade execution lines from a given text section.
 */
function parseExecutionsFromText(targetText: string): RawTradeExecution[] {
  const rawLines = targetText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Merge wrapped order lines (e.g. order number split across lines or leading order no)
  const mergedLines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i]!;
    while (/^\d{3,25}$/.test(line) && i + 1 < rawLines.length) {
      const next = rawLines[i + 1]!;
      if (/^\d{1,10}$/.test(next) || /^\d{1,2}:\d{2}/.test(next)) {
        i++;
        line = `${line} ${next}`;
      } else {
        break;
      }
    }
    mergedLines.push(line);
  }

  const executions: RawTradeExecution[] = [];

  for (const line of mergedLines) {
    if (!line || line.length < 8) continue;

    // Skip summary, subtotal or header lines
    if (
      /^(?:Total|Net Total|Summary|Annexure|Order\s*no|Security\s*Description|Description|Trade\s*Date)/i.test(line)
    ) {
      continue;
    }

    // Check if line contains F&O instrument indicators
    const hasInstrument =
      /\b(OPTIDX|OPTSTK|FUTIDX|FUTSTK|NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX|BANKEX|CRUDEOIL|NATURALGAS|GOLD|SILVER|CE|PE|FUT|CALL|PUT)\b/i.test(
        line
      );
    if (!hasInstrument) continue;

    // Extract time (order time, trade time)
    const timeMatches = line.match(/\b([012]?\d:[0-5]\d:[0-5]\d)\b/g);
    const orderTime = timeMatches?.[0];
    const tradeTime = timeMatches?.[1] || timeMatches?.[0];

    // Extract contract description
    const contract = parseContractDescription(line);

    // Look for side, quantity and price
    let side: "BUY" | "SELL" | null = null;
    let quantity = 0;
    let price = 0;

    // Format in Annexure A: [Exchange?] [B/S/BUY/SELL] [Quantity] [Gross Rate/Price] ...
    // e.g. "BSE B 60 320.80 320.80 -19248.00"
    // e.g. "BSE S -60 356.95 356.95 21417.00"
    // e.g. "B 65 110.50 -7182.50"
    const annexureTradePattern = /(?:NSE|BSE|MCX)?\s*\b([BS]|BUY|SELL)\b\s*(-?\d+)\s+([0-9,]+(?:\.\d+)?)/i;
    const match = line.match(annexureTradePattern);

    if (match) {
      const rawSide = match[1]!.toUpperCase();
      side = rawSide.startsWith("B") ? "BUY" : "SELL";
      quantity = Math.abs(parseInt(match[2]!, 10));
      price = parseFloat(match[3]!.replace(/,/g, ""));
    } else {
      // Fallback matching
      const sideMatch = line.match(/\b(BUY|SELL)\b/i) || line.match(/\s+([BS])\s+/i);
      if (!sideMatch) continue;
      side = sideMatch[1]!.toUpperCase().startsWith("B") ? "BUY" : "SELL";

      const afterSide = line.slice((sideMatch.index ?? 0) + sideMatch[0].length);
      const tokens = afterSide.split(/\s+/).filter(Boolean);
      const nums: number[] = [];
      for (const t of tokens) {
        const cleanT = t.replace(/,/g, "");
        if (/^-?\d+(?:\.\d+)?$/.test(cleanT)) {
          const v = parseFloat(cleanT);
          if (!isNaN(v) && v !== 0) nums.push(Math.abs(v));
        }
      }
      if (nums.length >= 2) {
        quantity = Math.floor(nums[0]!);
        price = nums[1]!;
      }
    }

    if (side && quantity > 0 && price > 0) {
      // Extract trade number and order number if present
      const orderNoMatch = line.match(/\b(\d{15,22})\b/);
      const orderNo = orderNoMatch ? orderNoMatch[1] : undefined;

      let tradeNo: string | undefined;
      if (orderTime) {
        const afterTime = line.slice(line.indexOf(orderTime) + orderTime.length).trim();
        const tNoMatch = afterTime.match(/^(\d{5,12})\b/);
        if (tNoMatch) tradeNo = tNoMatch[1];
      }

      executions.push({
        rawDescription: line,
        symbol: contract.symbol,
        segment: contract.segment,
        instrument_type: contract.instrument_type,
        strike_price: contract.strike_price,
        expiry: contract.expiry,
        side,
        quantity,
        price,
        time: tradeTime || orderTime,
        orderTime,
        tradeTime,
        orderNo,
        tradeNo,
      });
    }
  }

  return executions;
}

/**
 * Extracts raw trade execution lines from contract note text.
 * When Annexure A / Trade Details is present (like in Groww, Zerodha, Angel One),
 * we parse executions from Annexure A to get individual executed orders, avoiding
 * the combined WAP summary from Page 1.
 * If Annexure A has no trades, falls back to scanning the entire document.
 */
export function extractRawTradeExecutions(text: string): RawTradeExecution[] {
  // Check if text has an Annexure / Trade Log section
  const annexureRegex = /(?:Annexure\s*[A-Z]?|Trade\s*Details|Details\s*of\s*(?:All\s*)?Trades|Executed\s*Trades)/i;
  const annexureMatch = text.match(annexureRegex);

  if (annexureMatch && annexureMatch.index !== undefined) {
    const annexureExecs = parseExecutionsFromText(text.slice(annexureMatch.index));
    if (annexureExecs.length > 0) {
      return annexureExecs;
    }
  }

  // Fallback: parse entire document (e.g. Page 1 summary table when Annexure A is absent)
  return parseExecutionsFromText(text);
}

type ExecutionFill = {
  qty: number;
  price: number;
  time?: string;
  tradeNo?: string;
  orderNo?: string;
};

type MatchedTrade = {
  symbol: string;
  segment: FnoSegment;
  instrument_type: FnoInstrumentType;
  strike_price: string;
  expiry_date: string | null;
  trade_type: FnoTradeType;
  quantity: number;
  buy_price: number;
  sell_price: number;
  gross_pnl_paise: number;
  buyTurnoverPaise: number;
  sellTurnoverPaise: number;
  turnoverPaise: number;
  orderTime?: string;
  tradeTime?: string;
  note: string;
};

/**
 * Sequential FIFO Position Matcher for a contract:
 * Matches opening and closing executions into distinct round-trip trades.
 */
function matchContractExecutions(
  contractExecs: RawTradeExecution[],
  tradeDate: string
): MatchedTrade[] {
  const trades: MatchedTrade[] = [];

  let openSide: "BUY" | "SELL" | null = null;
  let openFills: ExecutionFill[] = [];
  let closingFills: ExecutionFill[] = [];
  let totalOpenQty = 0;
  let totalClosedQty = 0;

  const finishCurrentRound = () => {
    if (openFills.length === 0 || closingFills.length === 0) return;

    const matchedQty = Math.min(totalOpenQty, totalClosedQty);
    if (matchedQty <= 0) return;

    const buyFills = openSide === "BUY" ? openFills : closingFills;
    const sellFills = openSide === "BUY" ? closingFills : openFills;

    const buyTotalVal = buyFills.reduce((acc, f) => acc + f.qty * f.price, 0);
    const buyTotalQty = buyFills.reduce((acc, f) => acc + f.qty, 0);
    const avgBuyPrice = buyTotalQty > 0 ? buyTotalVal / buyTotalQty : 0;

    const sellTotalVal = sellFills.reduce((acc, f) => acc + f.qty * f.price, 0);
    const sellTotalQty = sellFills.reduce((acc, f) => acc + f.qty, 0);
    const avgSellPrice = sellTotalQty > 0 ? sellTotalVal / sellTotalQty : 0;

    const buyTurnoverPaise = Math.round(buyTotalVal * 100);
    const sellTurnoverPaise = Math.round(sellTotalVal * 100);
    const grossPnlPaise = sellTurnoverPaise - buyTurnoverPaise;
    const turnoverPaise = buyTurnoverPaise + sellTurnoverPaise;

    const firstBuyTime = buyFills[0]?.time;
    const lastSellTime = sellFills[sellFills.length - 1]?.time;
    const timeStr =
      firstBuyTime && lastSellTime
        ? `${firstBuyTime} → ${lastSellTime}`
        : firstBuyTime || lastSellTime || "";

    const firstExec = contractExecs[0]!;
    trades.push({
      symbol: firstExec.symbol,
      segment: firstExec.segment,
      instrument_type: firstExec.instrument_type,
      strike_price: firstExec.strike_price || "",
      expiry_date: firstExec.expiry,
      trade_type: openSide === "BUY" ? "buy_first" : "sell_first",
      quantity: matchedQty,
      buy_price: avgBuyPrice,
      sell_price: avgSellPrice,
      gross_pnl_paise: grossPnlPaise,
      buyTurnoverPaise,
      sellTurnoverPaise,
      turnoverPaise,
      orderTime: firstBuyTime,
      tradeTime: lastSellTime,
      note: timeStr
        ? `Executed ${timeStr} (${tradeDate})`
        : `Imported from Contract Note (${tradeDate})`,
    });

    openFills = [];
    closingFills = [];
    totalOpenQty = 0;
    totalClosedQty = 0;
    openSide = null;
  };

  for (const exec of contractExecs) {
    if (openSide === null) {
      openSide = exec.side;
      openFills.push({
        qty: exec.quantity,
        price: exec.price,
        time: exec.time,
        tradeNo: exec.tradeNo,
        orderNo: exec.orderNo,
      });
      totalOpenQty = exec.quantity;
      continue;
    }

    if (exec.side === openSide) {
      // Adding to open position
      openFills.push({
        qty: exec.quantity,
        price: exec.price,
        time: exec.time,
        tradeNo: exec.tradeNo,
        orderNo: exec.orderNo,
      });
      totalOpenQty += exec.quantity;
      continue;
    }

    // Opposite side: closing position
    const currentUnclosedQty = totalOpenQty - totalClosedQty;

    if (exec.quantity < currentUnclosedQty) {
      // Partial fill on closing leg
      closingFills.push({
        qty: exec.quantity,
        price: exec.price,
        time: exec.time,
        tradeNo: exec.tradeNo,
        orderNo: exec.orderNo,
      });
      totalClosedQty += exec.quantity;
    } else if (exec.quantity === currentUnclosedQty) {
      // Exactly closes position
      closingFills.push({
        qty: exec.quantity,
        price: exec.price,
        time: exec.time,
        tradeNo: exec.tradeNo,
        orderNo: exec.orderNo,
      });
      totalClosedQty += exec.quantity;
      finishCurrentRound();
    } else {
      // Position flip
      closingFills.push({
        qty: currentUnclosedQty,
        price: exec.price,
        time: exec.time,
        tradeNo: exec.tradeNo,
        orderNo: exec.orderNo,
      });
      totalClosedQty += currentUnclosedQty;
      finishCurrentRound();

      const leftoverQty = exec.quantity - currentUnclosedQty;
      openSide = exec.side;
      openFills = [
        {
          qty: leftoverQty,
          price: exec.price,
          time: exec.time,
          tradeNo: exec.tradeNo,
          orderNo: exec.orderNo,
        },
      ];
      totalOpenQty = leftoverQty;
      totalClosedQty = 0;
    }
  }

  // Handle unmatched fills
  if (openFills.length > 0 && closingFills.length > 0) {
    finishCurrentRound();
  } else if (openFills.length > 0) {
    const firstExec = contractExecs[0]!;
    const totalQty = openFills.reduce((acc, f) => acc + f.qty, 0);
    const avgPrice =
      openFills.reduce((acc, f) => acc + f.qty * f.price, 0) / totalQty;
    const isBuy = openSide === "BUY";
    trades.push({
      symbol: firstExec.symbol,
      segment: firstExec.segment,
      instrument_type: firstExec.instrument_type,
      strike_price: firstExec.strike_price || "",
      expiry_date: firstExec.expiry,
      trade_type: isBuy ? "buy_first" : "sell_first",
      quantity: totalQty,
      buy_price: isBuy ? avgPrice : 0,
      sell_price: isBuy ? 0 : avgPrice,
      gross_pnl_paise: 0,
      buyTurnoverPaise: isBuy ? Math.round(totalQty * avgPrice * 100) : 0,
      sellTurnoverPaise: isBuy ? 0 : Math.round(totalQty * avgPrice * 100),
      turnoverPaise: Math.round(totalQty * avgPrice * 100),
      orderTime: openFills[0]?.time,
      tradeTime: undefined,
      note: `Open position from Contract Note (${tradeDate})`,
    });
  }

  return trades;
}

/**
 * Intelligent Round-Trip Matcher:
 * Uses sequential execution matching to produce individual executed trades (Annexure A style).
 */
export function groupExecutionsIntoTrades(
  executions: RawTradeExecution[],
  tradeDate: string,
  totalChargesFoundPaise: number = 0
): {
  trades: ParsedFnoTrade[];
  totalGrossPnlPaise: number;
  totalChargesPaise: number;
  totalNetPnlPaise: number;
} {
  // Group by unique contract key
  const contractGroups: Record<string, RawTradeExecution[]> = {};

  for (const exec of executions) {
    const key = `${exec.symbol}_${exec.strike_price || "FUT"}_${exec.instrument_type}_${exec.expiry || ""}`;
    if (!contractGroups[key]) {
      contractGroups[key] = [];
    }
    contractGroups[key].push(exec);
  }

  const allMatchedTrades: MatchedTrade[] = [];
  let totalTurnoverPaise = 0;

  for (const group of Object.values(contractGroups)) {
    const matched = matchContractExecutions(group, tradeDate);
    for (const mt of matched) {
      allMatchedTrades.push(mt);
      totalTurnoverPaise += mt.turnoverPaise;
    }
  }

  // Sort trades chronologically by execution time if available
  allMatchedTrades.sort((a, b) => {
    const timeA = a.orderTime || a.tradeTime || "";
    const timeB = b.orderTime || b.tradeTime || "";
    if (timeA && timeB) return timeA.localeCompare(timeB);
    return 0;
  });

  const parsedTrades: ParsedFnoTrade[] = [];
  let totalGrossPnlPaise = 0;
  let totalChargesPaise = 0;
  let totalNetPnlPaise = 0;

  for (let idx = 0; idx < allMatchedTrades.length; idx++) {
    const pt = allMatchedTrades[idx]!;
    const defaultLs = getDefaultLotSize(pt.symbol, pt.segment);
    const lots = Math.max(1, Math.round(pt.quantity / defaultLs));
    const lotSize =
      pt.quantity >= defaultLs && pt.quantity % defaultLs === 0
        ? defaultLs
        : pt.quantity;

    // Calculate charges: allocate proportionally by turnover if contract note charges found,
    // otherwise compute standard broker charges
    let tradeChargesPaise = 0;
    if (totalChargesFoundPaise > 0 && totalTurnoverPaise > 0) {
      tradeChargesPaise = Math.round(
        (pt.turnoverPaise / totalTurnoverPaise) * totalChargesFoundPaise
      );
    } else {
      const breakdown = calculateGrowwCharges({
        symbol: pt.symbol,
        segment: pt.segment,
        instrumentType: pt.instrument_type,
        buyPriceRupees: pt.buy_price,
        sellPriceRupees: pt.sell_price,
        quantity: pt.quantity,
      });
      tradeChargesPaise = breakdown.totalChargesPaise;
    }

    const netPnlPaise = pt.gross_pnl_paise - tradeChargesPaise;

    totalGrossPnlPaise += pt.gross_pnl_paise;
    totalChargesPaise += tradeChargesPaise;
    totalNetPnlPaise += netPnlPaise;

    parsedTrades.push({
      id: `trade-${idx + 1}-${Date.now()}`,
      selected: true,
      symbol: pt.symbol,
      segment: pt.segment,
      instrument_type: pt.instrument_type,
      strike_price: pt.strike_price,
      strike_price_paise: pt.strike_price ? rupeesToPaise(pt.strike_price) : null,
      expiry_date: pt.expiry_date,
      trade_type: pt.trade_type,
      lots,
      lot_size: lotSize,
      quantity: pt.quantity,
      buy_price: pt.buy_price.toFixed(2),
      buy_price_paise: Math.round(pt.buy_price * 100),
      sell_price: pt.sell_price.toFixed(2),
      sell_price_paise: Math.round(pt.sell_price * 100),
      charges: (tradeChargesPaise / 100).toFixed(2),
      charges_paise: tradeChargesPaise,
      gross_pnl_paise: pt.gross_pnl_paise,
      net_pnl_paise: netPnlPaise,
      occurred_on: tradeDate,
      note: pt.note,
    });
  }

  return {
    trades: parsedTrades,
    totalGrossPnlPaise,
    totalChargesPaise,
    totalNetPnlPaise,
  };
}

/**
 * Main parser entry point: parses raw contract note text into structured trades
 */
export function parseContractNoteText(rawText: string): ParsedContractNoteResult {
  if (!rawText || rawText.trim().length === 0) {
    return {
      success: false,
      broker: "Unknown",
      tradeDate: todayISO(),
      trades: [],
      totalTrades: 0,
      totalGrossPnlPaise: 0,
      totalChargesPaise: 0,
      totalNetPnlPaise: 0,
      warnings: ["Contract note text is empty."],
    };
  }

  const broker = detectBroker(rawText);

  // Extract Trade Date
  let tradeDate = todayISO();
  const dateMatch =
    rawText.match(/Trade\s*Date[:\s]+([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i) ||
    rawText.match(/Date\s*(?:of\s*Contract\s*Note)?[:\s]+([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})/i) ||
    rawText.match(/Date[:\s]+([0-9]{1,2}[/-][A-Za-z]{3}[/-][0-9]{2,4})/i);

  if (dateMatch && dateMatch[1]) {
    const normalized = normalizeContractDate(dateMatch[1]);
    if (normalized) tradeDate = normalized;
  }

  // Extract Contract Note Number / Reference
  const cnMatch =
    rawText.match(/Contract\s*Note\s*(?:No|Number|Ref)[:\s]+([A-Za-z0-9_-]+)/i) ||
    rawText.match(/ECN\s*No[:\s]+([A-Za-z0-9_-]+)/i);
  const contractNoteNumber = cnMatch ? cnMatch[1] : undefined;

  // Extract Summary Charges
  const chargesSummary = extractChargesSummary(rawText);
  const totalChargesPaise = rupeesToPaise(chargesSummary.totalCharges.toFixed(2));

  // Extract Trade Executions
  const executions = extractRawTradeExecutions(rawText);

  const warnings: string[] = [];
  if (executions.length === 0) {
    warnings.push(
      "No individual F&O trade executions could be matched from the provided document. Verify this is a daily F&O contract note or tradebook."
    );
  }

  const { trades, totalGrossPnlPaise, totalChargesPaise: finalChargesPaise, totalNetPnlPaise } =
    groupExecutionsIntoTrades(executions, tradeDate, totalChargesPaise);

  return {
    success: trades.length > 0,
    broker,
    tradeDate,
    trades,
    totalTrades: trades.length,
    totalGrossPnlPaise,
    totalChargesPaise: finalChargesPaise,
    totalNetPnlPaise,
    warnings,
    contractNoteNumber,
  };
}

/**
 * Parses tabular rows from CSV / Excel tradebooks (Zerodha Console, Groww, Angel One, Upstox)
 */
export function parseContractNoteRows(
  rows: Record<string, unknown>[]
): ParsedContractNoteResult {
  if (!rows || rows.length === 0) {
    return {
      success: false,
      broker: "CSV/Excel Tradebook",
      tradeDate: todayISO(),
      trades: [],
      totalTrades: 0,
      totalGrossPnlPaise: 0,
      totalChargesPaise: 0,
      totalNetPnlPaise: 0,
      warnings: ["Tradebook spreadsheet is empty."],
    };
  }

  const findKey = (row: Record<string, unknown>, patterns: RegExp[]) =>
    Object.keys(row).find((k) => patterns.some((p) => p.test(k.trim().toLowerCase()))) || "";

  const firstRow = rows[0] || {};
  const symbolKey = findKey(firstRow, [/symbol/i, /contract/i, /scrip/i, /instrument/i, /security/i]);
  const sideKey = findKey(firstRow, [/^trade_type$/i, /^side$/i, /^type$/i, /buy.*sell/i, /b.*s/i]);
  const qtyKey = findKey(firstRow, [/quantity/i, /^qty$/i, /traded.*qty/i, /shares/i]);
  const priceKey = findKey(firstRow, [/price/i, /rate/i, /avg.*price/i, /trade.*price/i]);
  const dateKey = findKey(firstRow, [/date/i, /trade.*date/i, /txn.*date/i]);

  const executions: RawTradeExecution[] = [];
  let detectedDate = todayISO();

  for (const row of rows) {
    const rawSymbol = String(row[symbolKey] || "").trim();
    if (!rawSymbol) continue;

    const rawSide = String(row[sideKey] || "").trim().toUpperCase();
    const side: "BUY" | "SELL" =
      rawSide.startsWith("B") || rawSide.includes("BUY") ? "BUY" : "SELL";

    const qty = Math.abs(parseInt(String(row[qtyKey] || "0").replace(/,/g, ""), 10));
    const price = Math.abs(parseFloat(String(row[priceKey] || "0").replace(/,/g, "")));

    if (qty <= 0 || price <= 0 || isNaN(qty) || isNaN(price)) continue;

    if (dateKey && row[dateKey]) {
      const d = normalizeContractDate(String(row[dateKey]));
      if (d) detectedDate = d;
    }

    const contract = parseContractDescription(rawSymbol);

    executions.push({
      rawDescription: rawSymbol,
      symbol: contract.symbol,
      segment: contract.segment,
      instrument_type: contract.instrument_type,
      strike_price: contract.strike_price,
      expiry: contract.expiry,
      side,
      quantity: qty,
      price,
    });
  }

  const { trades, totalGrossPnlPaise, totalChargesPaise, totalNetPnlPaise } =
    groupExecutionsIntoTrades(executions, detectedDate, 0);

  return {
    success: trades.length > 0,
    broker: "Tradebook Import (CSV/Excel)",
    tradeDate: detectedDate,
    trades,
    totalTrades: trades.length,
    totalGrossPnlPaise,
    totalChargesPaise,
    totalNetPnlPaise,
    warnings:
      trades.length === 0
        ? ["Could not match any F&O trades from spreadsheet columns."]
        : [],
  };
}
