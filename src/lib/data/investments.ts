import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvestmentWithRefs } from "@/types/db";
import { toInvestmentRow, type InvestmentFormValues } from "@/lib/validations/investment";

async function currentUserId(db: SupabaseClient) {
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new Error("Your session has expired. Log in again.");
  return user.id;
}

export type HoldingSummary = {
  symbol: string;
  name: string;
  asset_type: string;
  netQuantity: number;
  totalInvestedPaise: number;
  averageBuyPricePaise: number;
  currentPricePaise: number | null; // null if unconfigured
  currentValuePaise: number | null; // null if unconfigured
  unrealizedGainPaise: number | null; // null if unconfigured
  realizedGainPaise: number;
};

export type PortfolioSummary = {
  tableMissing?: boolean;
  totalInvestedPaise: number;
  totalMarketValuePaise: number | null; // null if any holding has unconfigured price
  hasUnconfiguredPrices: boolean;
  totalRealizedGainPaise: number;
  totalUnrealizedGainPaise: number | null;
  totalIpoBlockedPaise: number;
  holdings: HoldingSummary[];
  trades: InvestmentWithRefs[];
};

export async function fetchInvestments(db: SupabaseClient): Promise<PortfolioSummary> {
  let trades: InvestmentWithRefs[] = [];
  let tableMissing = false;
  try {
    const { data, error } = await db
      .from("investments")
      .select("*, account:accounts(name)")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      if (/schema cache/i.test(error.message)) {
        tableMissing = true;
      } else {
        throw error;
      }
    } else if (data) {
      trades = data as InvestmentWithRefs[];
    }
  } catch (err) {
    if (err instanceof Error && /schema cache/i.test(err.message)) {
      tableMissing = true;
    } else {
      trades = [];
    }
  }

  // Symbol-wise grouping
  const symbolMap = new Map<string, {
    symbol: string;
    name: string;
    asset_type: string;
    buyQty: number;
    buyAmountPaise: number;
    sellQty: number;
    sellAmountPaise: number;
    latestCurrentPrice: number | null;
  }>();

  let totalIpoAppliedPaise = 0;
  let totalIpoRefundedPaise = 0;

  // Process trades in chronological order to calculate cost basis accurately
  const chronological = [...trades].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

  for (const t of chronological) {
    if (t.trade_type === "ipo_apply") {
      totalIpoAppliedPaise += t.amount_paise;
      continue;
    }
    if (t.trade_type === "ipo_refund") {
      totalIpoRefundedPaise += t.amount_paise;
      continue;
    }

    const sym = t.symbol.toUpperCase();
    if (!symbolMap.has(sym)) {
      symbolMap.set(sym, {
        symbol: sym,
        name: t.name,
        asset_type: t.asset_type,
        buyQty: 0,
        buyAmountPaise: 0,
        sellQty: 0,
        sellAmountPaise: 0,
        latestCurrentPrice: null,
      });
    }

    const entry = symbolMap.get(sym)!;
    if (t.current_price_paise !== null) {
      entry.latestCurrentPrice = t.current_price_paise;
    }

    if (t.trade_type === "buy" || t.trade_type === "ipo_allotment") {
      entry.buyQty += Number(t.quantity);
      entry.buyAmountPaise += Number(t.amount_paise);
    } else if (t.trade_type === "sell") {
      entry.sellQty += Number(t.quantity);
      entry.sellAmountPaise += Number(t.amount_paise);
    }
  }

  const holdings: HoldingSummary[] = [];
  let totalInvestedPaise = 0;
  let totalMarketValuePaise = 0;
  let hasUnconfiguredPrices = false;
  let totalRealizedGainPaise = 0;
  let totalUnrealizedGainPaise = 0;

  for (const [, entry] of symbolMap.entries()) {
    const netQty = entry.buyQty - entry.sellQty;
    const avgBuyPrice = entry.buyQty > 0 ? Math.round(entry.buyAmountPaise / entry.buyQty) : 0;
    const remainingCost = Math.round(netQty * avgBuyPrice);

    // Realized gain on sold portions: sell revenue - (sold quantity * avg buy price)
    const costOfSold = Math.round(entry.sellQty * avgBuyPrice);
    const realized = entry.sellAmountPaise - costOfSold;
    totalRealizedGainPaise += realized;

    if (netQty > 0.0001) {
      totalInvestedPaise += remainingCost;

      let currVal: number | null = null;
      let unrealized: number | null = null;

      if (entry.latestCurrentPrice !== null && entry.latestCurrentPrice > 0) {
        currVal = Math.round(netQty * entry.latestCurrentPrice);
        unrealized = currVal - remainingCost;
        totalMarketValuePaise += currVal;
        totalUnrealizedGainPaise += unrealized;
      } else {
        hasUnconfiguredPrices = true;
      }

      holdings.push({
        symbol: entry.symbol,
        name: entry.name,
        asset_type: entry.asset_type,
        netQuantity: netQty,
        totalInvestedPaise: remainingCost,
        averageBuyPricePaise: avgBuyPrice,
        currentPricePaise: entry.latestCurrentPrice,
        currentValuePaise: currVal,
        unrealizedGainPaise: unrealized,
        realizedGainPaise: realized,
      });
    } else if (entry.sellQty > 0) {
      // Fully exited position
      holdings.push({
        symbol: entry.symbol,
        name: entry.name,
        asset_type: entry.asset_type,
        netQuantity: 0,
        totalInvestedPaise: 0,
        averageBuyPricePaise: avgBuyPrice,
        currentPricePaise: entry.latestCurrentPrice,
        currentValuePaise: 0,
        unrealizedGainPaise: 0,
        realizedGainPaise: realized,
      });
    }
  }

  const totalIpoBlockedPaise = Math.max(0, totalIpoAppliedPaise - totalIpoRefundedPaise);

  return {
    tableMissing,
    totalInvestedPaise,
    totalMarketValuePaise: hasUnconfiguredPrices ? null : totalMarketValuePaise,
    hasUnconfiguredPrices,
    totalRealizedGainPaise,
    totalUnrealizedGainPaise: hasUnconfiguredPrices ? null : totalUnrealizedGainPaise,
    totalIpoBlockedPaise,
    holdings: holdings.sort((a, b) => b.totalInvestedPaise - a.totalInvestedPaise),
    trades,
  };
}

export async function createInvestment(db: SupabaseClient, v: InvestmentFormValues) {
  const user_id = await currentUserId(db);
  const row = { ...toInvestmentRow(v), user_id };
  const { error } = await db.from("investments").insert(row);
  if (error) throw error;
}

export async function updateInvestment(db: SupabaseClient, id: string, v: InvestmentFormValues) {
  const { data, error } = await db
    .from("investments")
    .update(toInvestmentRow(v))
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Investment trade not found.");
}

export async function deleteInvestment(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("investments").delete().eq("id", id).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Investment trade not found.");
}

export async function updateHoldingPrice(db: SupabaseClient, symbol: string, currentPricePaise: number) {
  const user_id = await currentUserId(db);
  const { error } = await db
    .from("investments")
    .update({ current_price_paise: currentPricePaise })
    .eq("user_id", user_id)
    .eq("symbol", symbol.toUpperCase());
  if (error) throw error;
}
